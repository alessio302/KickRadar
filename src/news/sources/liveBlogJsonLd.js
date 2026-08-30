import * as cheerio from 'cheerio';

// Shared by every source that expands a schema.org live-blog page into
// individual update entries (skysportsLiveBlog.js, fichajes.js) -- both
// sites turned out to use the same JSON-LD LiveBlogPosting/BlogPosting
// pattern, just with slightly different <script> layouts (Sky Sports: one
// JSON-LD document per <script> tag; fichajes.com: one <script> containing
// an array of several documents together, e.g. a BreadcrumbList alongside
// the LiveBlogPosting) and different available fields (Sky Sports entries
// carry their own #anchor url; fichajes.com's don't at all -- see
// fichajes.js's own comment on that).

// Handles both <script> layouts described above. Confirmed live for both
// sites: a first attempt assuming a flat array of BlogPostings silently
// found zero entries on Sky Sports' page, since its root is actually a
// single LiveBlogPosting object (not an array at all), with the individual
// updates nested under its own `liveBlogUpdate` array.
export function collectBlogPostings(parsed) {
  const roots = Array.isArray(parsed) ? parsed : [parsed];
  const posts = [];
  for (const root of roots) {
    if (root?.['@type'] === 'BlogPosting') posts.push(root);
    else if (root?.['@type'] === 'LiveBlogPosting' && Array.isArray(root.liveBlogUpdate)) {
      posts.push(...root.liveBlogUpdate.filter((p) => p?.['@type'] === 'BlogPosting'));
    }
  }
  return posts;
}

// The JSON-LD content is HTML-entity-encoded even though it's JSON, not
// HTML (Sky Sports: "Forest&#x27;s", "deal.&nbsp;Talks..."; fichajes.com:
// an em dash as "&mdash;" inside quoted tweets) -- JSON.parse only undoes
// JSON's own escaping, so this still needs a real HTML entity decode
// afterwards. Reuses cheerio (an existing dependency, see articleBody.js)
// rather than a hand-rolled replacement list, since its HTML parser
// already decodes any entity correctly, not just the couple seen so far --
// and collapses the run of whitespace &nbsp; decodes to, same
// normalization articleBody.js already applies to real article text.
export function decodeEntities(text) {
  if (!text) return '';
  return cheerio.load(`<div>${text}</div>`)('div').text().replace(/\s+/g, ' ').trim();
}
