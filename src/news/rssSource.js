import Parser from 'rss-parser';

// Some outlets (confirmed: tuttomercatoweb, 403) sit behind bot protection
// that blocks requests not looking like a real browser. UA + Accept alone
// wasn't enough for tuttomercatoweb (still 403'd from the GitHub Actions
// runner even with a Chrome UA) -- adding the rest of a typical browser's
// header set in case it's a basic header-based check rather than something
// deeper (e.g. Cloudflare's JS/TLS-fingerprint challenge, which no header
// combination can pass -- see README if this doesn't fix it).
const parser = new Parser({
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
    'Accept-Language': 'en-US,en;q=0.9,it;q=0.8,de;q=0.7',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Dest': 'document',
    'Upgrade-Insecure-Requests': '1',
  },
});

// rss-parser leaves any element it doesn't recognize as a first-class field
// (media:content, media:thumbnail) as a raw xml2js node under its
// namespaced tag name -- {$: {url: ...}} for a single element, an array of
// those for several. Tried in the order a real-world feed is most likely to
// carry image info: a plain <enclosure>, then MRSS media:content/thumbnail,
// then finally an <img> sniffed out of any inline HTML content. Only
// consumed by the News pipeline today (runGeneralNewsScraper.js -- card
// thumbnails), but computed here for every source so a transfers source
// gets it too for free if a future card design wants one.
function extractImage(item) {
  if (item.enclosure?.url) return item.enclosure.url;
  for (const key of ['media:content', 'media:thumbnail']) {
    const node = item[key];
    if (!node) continue;
    const first = Array.isArray(node) ? node[0] : node;
    const url = first?.$?.url || first?.url;
    if (url) return url;
  }
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(item['content:encoded'] || item.content || '');
  return match?.[1] ?? null;
}

// Confirmed live (gazzetta.js, diagnoseGeneralNewsFeeds.js's real-world run):
// a <guid isPermaLink="false">text</guid> element -- valid, common RSS --
// comes back from rss-parser as an object ({_: 'text', $: {isPermaLink:
// 'false'}}), not a plain string, whenever it carries an attribute. Every
// other source's plain <guid>text</guid> (no attributes) already comes back
// as a string, so this went unnoticed until a source that actually uses the
// attribute form hit it. runGeneralNewsScraper.js's externalIdFor() then
// crashed the whole source's scrape (createHash().update() requires a
// string/Buffer) since `item.guid || item.link` is truthy for an object and
// never falls through to the link. Coerce defensively here, once, for every
// caller instead of trusting the shape.
function guidToString(guid) {
  if (typeof guid === 'string') return guid;
  if (guid && typeof guid === 'object') return guid._ ?? guid['#text'] ?? null;
  return null;
}

// Shared factory for the RSS-based sources (tuttomercatoweb, kicker). Feed
// URL is env-overridable per source since the exact feed path/section can
// only be confirmed with real internet access to the site (unavailable in
// this sandbox) -- verify once and set the env var if the default guess
// turns out wrong, no code change needed.
export function createRssSource({ sourceKey, feedUrlEnvVar, defaultFeedUrl }) {
  return {
    sourceKey,
    async fetchLatest() {
      const feedUrl = process.env[feedUrlEnvVar] || defaultFeedUrl;
      const feed = await parser.parseURL(feedUrl);
      return feed.items.map((item) => {
        // Confirmed live: tuttomercatoweb's section-filtered feed
        // (?s=calciomercato) returns "." as a description placeholder
        // instead of leaving it empty. Treat anything that isn't real
        // prose as empty so callers fall back to the (meaningful) title
        // instead of storing a single dot as the summary.
        const rawSummary = (item.contentSnippet || item.summary || item.content || '').trim();
        const summary = rawSummary.length > 3 ? rawSummary.slice(0, 400) : '';
        return {
          title: item.title?.trim() || '',
          link: item.link,
          guid: guidToString(item.guid) || item.link,
          publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
          summary,
          image: extractImage(item),
        };
      });
    },
  };
}
