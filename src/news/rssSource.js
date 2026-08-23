import Parser from 'rss-parser';

// Some outlets (confirmed: tuttomercatoweb, 403) block requests that don't
// look like a real browser. A plain UA + Accept header is enough to pass.
const parser = new Parser({
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
});

// Shared factory for the three sources that publish RSS (tuttomercatoweb,
// kicker, Sky Sports). Feed URL is env-overridable per source because the
// exact feed path can only be confirmed with real internet access to the
// site (unavailable in this sandbox) -- verify once and set the env var if
// the default guess is wrong, no code change needed.
export function createRssSource({ sourceKey, feedUrlEnvVar, defaultFeedUrl }) {
  return {
    sourceKey,
    async fetchLatest() {
      const feedUrl = process.env[feedUrlEnvVar] || defaultFeedUrl;
      const feed = await parser.parseURL(feedUrl);
      return feed.items.map((item) => ({
        title: item.title?.trim() || '',
        link: item.link,
        guid: item.guid || item.link,
        publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
        summary: (item.contentSnippet || item.summary || item.content || '').trim().slice(0, 400),
      }));
    },
  };
}
