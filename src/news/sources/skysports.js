import { createRssSource } from '../rssSource.js';

export default createRssSource({
  sourceKey: 'skysports',
  feedUrlEnvVar: 'SKYSPORTS_RSS_URL',
  defaultFeedUrl: 'https://www.skysports.com/rss/12040',
});
