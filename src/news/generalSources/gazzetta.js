import { createRssSource } from '../rssSource.js';

// Confirmed live (diagnoseGeneralNewsFeeds.js): 100 items, images present.
// Not Serie-A-exclusive (Gazzetta covers all Italian sport), so relies on
// the same findMentionedClubs() league-resolution gate as the
// cross-league sources (BBC, Guardian, Marca, RMC Sport) in
// runGeneralNewsScraper.js.
export default createRssSource({
  sourceKey: 'gazzetta',
  feedUrlEnvVar: 'GAZZETTA_RSS_URL',
  defaultFeedUrl: 'https://www.gazzetta.it/rss/calcio.xml',
});
