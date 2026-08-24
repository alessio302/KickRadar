import { createSitemapNewsSource } from '../sitemapSource.js';

// Switched from RSS to Sky Sports' football news sitemap: confirmed live
// that the RSS feed IDs we tried (11095, 12040) are all-sports feeds, which
// pulled golf/rugby/darts/F1 into the transfer feed. The sitemap is
// guaranteed football-only; the general relevance filter (relevance.js)
// then narrows it down to transfer-shaped stories.
const base = createSitemapNewsSource({
  sourceKey: 'skysports',
  sitemapUrlEnvVar: 'SKYSPORTS_SITEMAP_URL',
  defaultSitemapUrl: 'https://www.skysports.com/sitemap_news_football.xml',
});

// Confirmed live: alongside real single-story articles ("Ayyoub Bouaddi
// transfer: Manchester City reach agreement with Lille..."), the sitemap
// also carries each club's evergreen "transfer hub" page (title pattern:
// "<Club> transfer news, rumours and gossip: Live updates..."). Those are
// standing pages updated continuously, not discrete news items -- there's
// no single event or publish date behind them, so they don't fit the
// transfers table's one-row-per-story model. "Live updates" in the title
// reliably distinguishes them from real stories (checked against every
// title seen so far).
const HUB_PAGE_PATTERN = /live updates/i;

export default {
  sourceKey: base.sourceKey,
  async fetchLatest() {
    const items = await base.fetchLatest();
    return items.filter((item) => !HUB_PAGE_PATTERN.test(item.title));
  },
};
