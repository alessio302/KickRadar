import { createHash } from 'node:crypto';
import { collectBlogPostings, decodeEntities } from './liveBlogJsonLd.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const LIVE_URL = 'https://www.fichajes.com/mercado-directo';

// Same rationale as skysportsLiveBlog.js's own MAX_AGE_DAYS -- avoids
// pointlessly re-processing entries seen_news_items would skip anyway.
const MAX_AGE_DAYS = 3;

// fichajes.com's own live transfer-market ticker (confirmed live via a
// screenshot of a real update -- "AC Milan reach agreement..."-style
// one-paragraph updates, in Spanish, covering clubs across LaLiga and
// beyond) uses the exact same schema.org LiveBlogPosting/BlogPosting
// JSON-LD pattern Sky Sports' live blogs do -- see liveBlogJsonLd.js for
// the shared parsing. No club/keyword scoping needed here beyond that:
// this page is already fichajes.com's own dedicated "mercado" (transfer
// market) ticker, not a general football feed, same reasoning
// relevance.js's own comment already gives for marca.js having no
// keyword gate either.
//
// Unlike Sky Sports, individual entries here carry no permalink of their
// own at all -- confirmed live: every entry's mainEntityOfPage is just
// this same LIVE_URL, verbatim, with no per-entry #anchor or id field
// anywhere on the entry. `link`/`source_url` (what the app's "read
// original" button actually opens, see TransferSummaryOverlay.jsx) stays
// this honest live-ticker URL rather than a fabricated #fragment that
// wouldn't scroll to anything real -- but `guid` (used only internally
// for seen_news_items/dedup, see externalIdFor() in runNewsScraper.js)
// has to be a value unique per entry regardless, or every entry here
// would hash to the identical external_id and only the first one ever
// fetched would ever be stored.
export default {
  sourceKey: 'fichajes',
  async fetchLatest() {
    const res = await fetch(LIVE_URL, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${LIVE_URL}: ${res.status} ${res.statusText}`);
    }
    const html = await res.text();
    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

    const items = [];
    const scriptMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of scriptMatches) {
      let parsed;
      try {
        parsed = JSON.parse(match[1]);
      } catch {
        continue; // not the JSON we expect -- skip this block
      }
      for (const post of collectBlogPostings(parsed)) {
        if (!post.headline) continue;

        const publishedDate = post.datePublished ? new Date(post.datePublished) : null;
        if (!publishedDate || Number.isNaN(publishedDate.getTime()) || publishedDate.getTime() < cutoff) continue;

        const headline = decodeEntities(post.headline);
        const body = decodeEntities(post.articleBody);
        const guid = createHash('sha256').update(`${publishedDate.toISOString()}:${headline}`).digest('hex');

        items.push({
          title: headline,
          link: LIVE_URL,
          guid,
          publishedAt: publishedDate.toISOString(),
          summary: body || headline,
          // Same reasoning as skysportsLiveBlog.js's own skipBodyFetch:
          // link is the shared live-ticker page, not a page of this
          // entry's own, so re-fetching it in runNewsScraper.js would
          // extract every entry's text mixed together instead of just
          // this one's already-correct, already-scoped body.
          skipBodyFetch: true,
        });
      }
    }
    return items;
  },
};
