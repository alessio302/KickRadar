import { createRssSource } from '../rssSource.js';

// Cross-league/international, same as bbcFootball.js -- resolved to a
// tracked league via findMentionedClubs() in runGeneralNewsScraper.js.
export default createRssSource({
  sourceKey: 'guardian-football',
  feedUrlEnvVar: 'GUARDIAN_FOOTBALL_RSS_URL',
  defaultFeedUrl: 'https://www.theguardian.com/football/rss',
});
