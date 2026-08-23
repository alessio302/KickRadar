import { createRssSource } from '../rssSource.js';

// The plain /rss/ feed is all homepage news (match reports, interviews,
// history pieces), not just transfers -- confirmed live, it was polluting
// the transfer feed. TMW's RSS system supports section filters (confirmed:
// ?s=seriec exists for Serie C), so this guesses the calciomercato section
// filter. If it 404s/empties out, fall back to the plain feed via
// TUTTOMERCATOWEB_RSS_URL and revisit.
export default createRssSource({
  sourceKey: 'tuttomercatoweb',
  feedUrlEnvVar: 'TUTTOMERCATOWEB_RSS_URL',
  defaultFeedUrl: 'https://www.tuttomercatoweb.com/rss/?s=calciomercato',
});
