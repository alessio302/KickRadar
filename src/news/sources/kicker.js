import { createRssSource } from '../rssSource.js';

export default createRssSource({
  sourceKey: 'kicker',
  feedUrlEnvVar: 'KICKER_RSS_URL',
  defaultFeedUrl: 'https://newsfeed.kicker.de/news/bundesliga',
});
