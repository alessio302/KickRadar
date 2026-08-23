import { createSitemapNewsSource } from '../sitemapSource.js';

// Switched from RSS to Sky Sports' football news sitemap: confirmed live
// that the RSS feed IDs we tried (11095, 12040) are all-sports feeds, which
// pulled golf/rugby/darts/F1 into the transfer feed. The sitemap is
// guaranteed football-only; the general relevance filter (relevance.js)
// then narrows it down to transfer-shaped stories.
export default createSitemapNewsSource({
  sourceKey: 'skysports',
  sitemapUrlEnvVar: 'SKYSPORTS_SITEMAP_URL',
  defaultSitemapUrl: 'https://www.skysports.com/sitemap_news_football.xml',
});
