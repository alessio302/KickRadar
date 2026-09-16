import { createRssSource } from '../rssSource.js';

// The PLAIN /rss/ feed (all Serie A/Italian football news, not just
// calciomercato) -- the transfers pipeline's own sources/tuttomercatoweb.js
// deliberately avoids this same feed because it's too broad for a
// transfer-only list, but that's exactly the right breadth for News.
// Distinct sourceKey ('tuttomercatoweb-general' vs 'tuttomercatoweb') for
// the same seen_news_items isolation reason as kickerGeneral.js.
export default createRssSource({
  sourceKey: 'tuttomercatoweb-general',
  feedUrlEnvVar: 'TUTTOMERCATOWEB_GENERAL_RSS_URL',
  defaultFeedUrl: 'https://www.tuttomercatoweb.com/rss/',
});
