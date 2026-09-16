import { createRssSource } from '../rssSource.js';

// Confirmed live (diagnoseGeneralNewsFeeds.js): real RSS, 30 items, images
// present -- covers French football generally (not Ligue-1-exclusive), so
// still goes through findMentionedClubs(). A league-scoped RSS guess
// (.../rss/football/ligue-1/) also returned 30 identical items on the same
// run, suggesting it's not actually filtered -- using the known-general
// path here rather than relying on that until it's verified separately.
export default createRssSource({
  sourceKey: 'rmcsport-football',
  feedUrlEnvVar: 'RMCSPORT_FOOTBALL_RSS_URL',
  defaultFeedUrl: 'https://rmcsport.bfmtv.com/rss/football/',
});
