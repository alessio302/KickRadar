// One-off diagnostic: looking for a more Ligue-1-focused replacement for
// rmcsport.js -- confirmed live (previous diagnostic) that RMC Sport's
// general "Transferts" hub page mostly surfaces big pan-European
// storylines (Man City, Chelsea, Barcelona, Atletico), so only a small
// fraction of what it fetches actually involves a Ligue 1 club, unlike
// tuttomercatoweb's dedicated calciomercato feed for Serie A or marca's
// dedicated "Mercado de Fichajes" section for LaLiga.
//
// Tries a handful of candidate French football/mercato sources (RSS first,
// HTML fallback) and reports what's actually live: status code, item
// count, and the first several titles/links, so a real pick can be made
// instead of guessing blind. Read-only, no DB writes, no secrets needed.
import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function tryRss(label, url) {
  console.log(`\n=== RSS: ${label} (${url}) ===`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    console.log(`status: ${res.status} ${res.statusText}, content-type: ${res.headers.get('content-type')}`);
    if (!res.ok) return;
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const items = $('item');
    console.log(`item count: ${items.length}`);
    items.slice(0, 12).each((_, el) => {
      const title = $(el).find('title').first().text().trim();
      const link = $(el).find('link').first().text().trim();
      const pubDate = $(el).find('pubDate').first().text().trim();
      console.log(`  [${pubDate}] "${title}" -> ${link}`);
    });
  } catch (err) {
    console.log(`fetch failed: ${err.message}`);
  }
}

async function tryHtml(label, url, itemSelector) {
  console.log(`\n=== HTML: ${label} (${url}), selector "${itemSelector}" ===`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    console.log(`status: ${res.status} ${res.statusText}`);
    if (!res.ok) return;
    const html = await res.text();
    console.log(`page length: ${html.length} chars, <title>: ${cheerio.load(html)('title').first().text().trim()}`);
    const $ = cheerio.load(html);
    const items = $(itemSelector);
    console.log(`selector match count: ${items.length}`);
    const seen = new Set();
    let shown = 0;
    items.each((_, el) => {
      if (shown >= 15) return;
      const title = $(el).text().trim().replace(/\s+/g, ' ');
      const href = $(el).attr('href');
      if (!title || seen.has(title)) return;
      seen.add(title);
      shown += 1;
      console.log(`  "${title}" -> ${href}`);
    });
  } catch (err) {
    console.log(`fetch failed: ${err.message}`);
  }
}

async function main() {
  // RSS candidates -- dedicated French transfer-market / football sources.
  await tryRss('Foot Mercato (dedicated transfer site)', 'https://www.footmercato.net/rss');
  await tryRss('Foot Mercato (alt path)', 'https://www.footmercato.net/feed');
  await tryRss("L'Équipe football (general, would need relevance filter)", 'https://www.lequipe.fr/rss/actu_rss_Football.xml');
  await tryRss('So Foot', 'https://www.sofoot.com/rss.xml');
  await tryRss('Foot01', 'https://www.foot01.com/feed');

  // HTML fallback candidates, in case none of the above RSS urls are real.
  await tryHtml('Foot Mercato mercato section', 'https://www.footmercato.net/mercato', 'article a, h2 a, h3 a');
  await tryHtml('RMC Sport Ligue 1-specific mercato page (vs the general /transferts/ one)', 'https://rmcsport.bfmtv.com/football/ligue-1/mercato/', 'article a, h2 a, h3 a');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
