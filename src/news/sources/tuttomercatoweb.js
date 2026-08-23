import { createRssSource } from '../rssSource.js';

export default createRssSource({
  sourceKey: 'tuttomercatoweb',
  feedUrlEnvVar: 'TUTTOMERCATOWEB_RSS_URL',
  defaultFeedUrl: 'https://www.tuttomercatoweb.com/rss',
});
