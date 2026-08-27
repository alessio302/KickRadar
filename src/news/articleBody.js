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

    const scope = $('article').length > 0 ? $('article') : $('body');
    const paragraphs = scope
      .find('p')
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter((text) => text.length >= MIN_PARAGRAPH_LENGTH);

    const text = paragraphs.join(' ').slice(0, MAX_CHARS);
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
