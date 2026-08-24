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
          guid: item.guid || item.link,
          publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
          summary,
        };
      });
    },
  };
}
