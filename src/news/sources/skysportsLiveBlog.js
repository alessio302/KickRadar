import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Only entries published within this window are worth surfacing on a
// fresh run -- a live blog's own JSON-LD carries its FULL history (weeks
// of entries), and re-processing all of it every run would mean
// pointlessly re-checking hundreds of already-seen entries just to find
// the handful of new ones. Older entries are safe either way regardless
// of this (seen_news_items would skip them too), this just avoids the
// wasted work.
const MAX_AGE_DAYS = 3;

// The JSON-LD content is HTML-entity-encoded ("Forest&#x27;s",
// "deal.&nbsp;Talks...") even though it's JSON, not HTML -- JSON.parse
// only undoes JSON's own escaping, so this still needs a real HTML entity
// decode afterwards. Reuses cheerio (an existing dependency, see
// articleBody.js) rather than a hand-rolled replacement list, since its
// HTML parser already decodes any entity correctly, not just the couple
// seen so far -- and collapses the run of whitespace &nbsp; decodes to,
// same normalization articleBody.js already applies to real article text.
function decodeEntities(text) {
  if (!text) return '';
  return cheerio.load(`<div>${text}</div>`)('div').text().replace(/\s+/g, ' ').trim();
}

// Sky's own live blog pages (Transfer Centre LIVE, and each club's own
// transfer blog -- see skysports.js's LIVE_BLOG_PATTERN) embed every
// individual timestamped update as a schema.org BlogPosting object in a
// JSON-LD <script> block, right there in the plain server-rendered HTML --
// confirmed live, no separate API call or JS execution needed. This is
// exactly the content a blog's own sitemap entry can never represent as a
// single story (see skysports.js): a one-paragraph update like "AC Milan
// reach agreement to sign Forest's Hutchinson on initial loan" only ever
// existed as one of these, never as its own article.
//
// Iterates every <script type="application/ld+json"> block (there are
// others on the page too, e.g. Organization/WebSite schema) and keeps
// only entries actually typed BlogPosting, rather than assuming there's
// exactly one script tag or one array shape.
export async function fetchLiveBlogEntries(blogUrl) {
  const res = await fetch(blogUrl, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${blogUrl}: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const origin = new URL(blogUrl).origin;
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  const items = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let parsed;
    try {
      parsed = JSON.parse($(el).contents().text());
    } catch {
      return; // not the JSON we expect -- skip this block
    }
    const posts = Array.isArray(parsed) ? parsed : [parsed];
    for (const post of posts) {
      if (post?.['@type'] !== 'BlogPosting' || !post.headline || !post.url) continue;

      // datePublished has no timezone offset (e.g. "2026-08-29T21:29:07")
      // -- Sky Sports is UK-based, so this is almost certainly UK local
      // time (GMT/BST), not UTC. Parsed as-is regardless: GitHub Actions
      // runners run in UTC, so a plain `new Date(...)` on an offset-less
      // string reads it as UTC too, meaning published_at can be off by up
      // to an hour during BST. Acceptable for what published_at is
      // actually used for (ordering + "vor X Std" relative display, not
      // second-level precision) -- not worth a timezone-conversion
      // dependency for an hour of drift.
      const publishedDate = post.datePublished ? new Date(post.datePublished) : null;
      if (!publishedDate || Number.isNaN(publishedDate.getTime()) || publishedDate.getTime() < cutoff) continue;

      const link = new URL(post.url, origin).toString();
      const body = decodeEntities(post.articleBody);
      items.push({
        title: decodeEntities(post.headline),
        link,
        guid: link,
        publishedAt: publishedDate.toISOString(),
        summary: body || decodeEntities(post.headline),
        // Already the correctly-scoped full text of exactly this one
        // entry -- runNewsScraper.js's fetchArticleText(item.link) step
        // must not re-fetch it: item.link is the shared live-blog page
        // (this entry's own #anchor is never sent to the server), so that
        // would just re-extract every <p> on the whole blog page mixed
        // together, clobbering this entry's real summary with a garbled
        // multi-entry blob.
        skipBodyFetch: true,
      });
    }
  });
  return items;
}
