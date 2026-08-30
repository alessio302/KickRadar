import { createSitemapNewsSource } from '../sitemapSource.js';
import { fetchLiveBlogEntries } from './skysportsLiveBlog.js';

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
// "<Club> transfer news, rumours and gossip: Live updates...") and the
// site-wide "Transfer Centre LIVE!..." blog. Those pages themselves aren't
// discrete news items -- there's no single event or publish date behind
// the page as a whole, so the *page* doesn't fit the transfers table's
// one-row-per-story model. Every one of them lives under this same
// /live-blog/ URL path (confirmed live across every example seen so far,
// including "Transfer Centre LIVE!" whose title -- unlike the per-club
// pages -- doesn't even contain the words "Live updates"), which is a far
// more reliable signal than matching every title format Sky happens to
// phrase these with.
//
// Rather than just discarding them, each is expanded into its own real,
// individually timestamped update entries instead (see
// skysportsLiveBlog.js) -- a lot of genuine, fast-moving transfer news (a
// one-paragraph loan-agreement update, say) only ever exists as one of
// these and never gets its own standalone article at all. Confirmed live:
// "AC Milan reach agreement to sign Forest's Hutchinson on initial loan"
// only ever existed as an entry inside the site-wide Transfer Centre live
// blog, never as its own sitemap URL.
const LIVE_BLOG_PATTERN = /\/live-blog\//;

export default {
  sourceKey: base.sourceKey,
  async fetchLatest() {
    const items = await base.fetchLatest();
    const articles = items.filter((item) => !LIVE_BLOG_PATTERN.test(item.link));
    const liveBlogUrls = items.filter((item) => LIVE_BLOG_PATTERN.test(item.link)).map((item) => item.link);

    const expanded = [];
    for (const url of liveBlogUrls) {
      try {
        expanded.push(...(await fetchLiveBlogEntries(url)));
      } catch (err) {
        console.warn(`[skysports] failed to expand live blog ${url}:`, err.message);
      }
    }

    return [...articles, ...expanded];
  },
};
