import { createRssSource } from '../rssSource.js';

// General Marca football RSS (not La-Liga-exclusive -- Marca covers
// international football too), resolved via findMentionedClubs(). Distinct
// from the transfers pipeline's own sources/marca.js, which HTML-scrapes a
// different page (the "mercado de fichajes" transfer section, no RSS
// available there) -- this feed is separate and has its own RSS.
export default createRssSource({
  sourceKey: 'marca-general',
  feedUrlEnvVar: 'MARCA_GENERAL_RSS_URL',
  defaultFeedUrl: 'https://e00-marca.uecdn.es/rss/futbol.xml',
});
