import { createRssSource } from '../rssSource.js';

// Cross-league/international football coverage, not Premier-League-only --
// runGeneralNewsScraper.js's findMentionedClubs() gate resolves which
// tracked league(s) an item actually belongs to.
export default createRssSource({
  sourceKey: 'bbc-football',
  feedUrlEnvVar: 'BBC_FOOTBALL_RSS_URL',
  defaultFeedUrl: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
});
