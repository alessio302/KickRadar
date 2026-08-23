import Parser from 'rss-parser';

const parser = new Parser();

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
