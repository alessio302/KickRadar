import * as cheerio from 'cheerio';

// Best-effort "readable article text" extraction for a single story page --
// a shared, generic heuristic (prefer <article> if present, else the whole
// <body>'s <p> tags, dropping short boilerplate lines) rather than a
// per-source body selector, so it doesn't need the same kind of ongoing
// per-site maintenance the list-page selectors already do (marca.js,
// footmercato.js have each needed several rounds of that as the sites' markup
// shifted). Never throws -- a failed fetch, block, or empty extraction just
// means the caller falls back to the item's own title/summary, same as
// before this existed.
const MAX_CHARS = 3000;
const MIN_PARAGRAPH_LENGTH = 40;

function extractParagraphs($, scope) {
  return scope
    .find('p')
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter((text) => text.length >= MIN_PARAGRAPH_LENGTH);
}

export async function fetchArticleText(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    // Confirmed live (footmercato.net): a page can have <article> tags that
    // aren't the story at all -- there, 21 of them turned out to be
    // "recommended article" teaser cards elsewhere on the page, each with
    // no <p> content, while the real story text sat in a plain <div>
    // outside all of them. Scoping to <article> then found zero paragraphs
    // and returned null, so the LLM only ever saw the bare headline for
    // this source -- correct extraction, just nothing to summarize.
    // Falling back to <body> when the <article> scope comes up empty
    // catches this without giving up the (still useful, e.g. tuttomercatoweb)
    // preference for a real single-article wrapper when one exists.
    let paragraphs = extractParagraphs($, $('article'));
    if (paragraphs.length === 0) paragraphs = extractParagraphs($, $('body'));

    const text = paragraphs.join(' ').slice(0, MAX_CHARS);
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
