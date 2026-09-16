import { createRssSource } from '../rssSource.js';

// Confirmed live (diagnoseGeneralNewsFeeds.js): valid RSS, full-text
// content:encoded, not in the original research doc -- found by directly
// probing sportschau.de's own /fussball/ section feed.
export default createRssSource({
  sourceKey: 'sportschau',
  feedUrlEnvVar: 'SPORTSCHAU_RSS_URL',
  defaultFeedUrl: 'https://www.sportschau.de/fussball/index~rss2.xml',
});
