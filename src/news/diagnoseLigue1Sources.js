// One-off diagnostic: looking for a more Ligue-1-focused replacement for
// rmcsport.js -- confirmed live (previous diagnostic round) that RMC
// Sport's general "Transferts" hub page mostly surfaces big pan-European
// storylines (Man City, Chelsea, Barcelona, Atletico), so only a small
// fraction of what it fetches actually involves a Ligue 1 club, unlike
// tuttomercatoweb's dedicated calciomercato feed for Serie A or marca's
// dedicated "Mercado de Fichajes" section for LaLiga.
//
// Round 1 (first version of this script) guessed several candidate URLs
// from memory and every single one 404'd -- this sandbox has no live
// network access to confirm real URLs, only the GitHub Actions runner
// does (same situation the very first tuttomercatoweb/marca sources were
// built under). Round 2: candidates below came from a real web search
// (footmercato.net has a dedicated /france/ligue-1/transfert page and a
// sitemap-news.xml; topmercato.com and rss-mercato.fr both claim RSS
// support) -- this pass just dumps raw response snippets so real
// structure can be read off, rather than guessing selectors blind again.
// Read-only, no DB writes, no secrets needed.
import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function dump(label, url) {
  console.log(`\n=== ${label} (${url}) ===`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    console.log(`status: ${res.status} ${res.statusText}, content-type: ${res.headers.get('content-type')}`);
    if (!res.ok) return;
    const text = await res.text();
    console.log(`length: ${text.length} chars`);

    const looksXml = text.trimStart().startsWith('<?xml') || res.headers.get('content-type')?.includes('xml');
    if (looksXml) {
      const $ = cheerio.load(text, { xmlMode: true });
      const items = $('item, url'); // 'url' for sitemaps
      console.log(`XML node count (item/url): ${items.length}`);
      items.slice(0, 15).each((_, el) => {
        const title = $(el).find('title').first().text().trim();
        const loc = $(el).find('loc').first().text().trim();
        const link = $(el).find('link').first().text().trim();
        const pubDate = $(el).find('pubDate, news\\:publication_date, lastmod').first().text().trim();
        console.log(`  [${pubDate}] "${title}" -> ${loc || link}`);
      });
    } else {
      // HTML: report <title>, any RSS <link> tags, and a sample of anchors
      // with non-trivial text, so real selectors can be picked afterwards.
      const $ = cheerio.load(text);
      console.log(`<title>: ${$('title').first().text().trim()}`);
      $('link[type="application/rss+xml"], link[type="application/atom+xml"]').each((_, el) => {
        console.log(`  RSS/Atom <link>: ${$(el).attr('href')} (title="${$(el).attr('title')}")`);
      });
      const anchors = $('a')
        .filter((_, el) => $(el).text().trim().length > 25)
        .toArray();
      console.log(`anchors with >25 chars of text: ${anchors.length}`);
      const seen = new Set();
      let shown = 0;
      for (const el of anchors) {
        if (shown >= 20) break;
        const title = $(el).text().trim().replace(/\s+/g, ' ');
        const href = $(el).attr('href');
        if (seen.has(title)) continue;
        seen.add(title);
        shown += 1;
        console.log(`  "${title}" -> ${href}`);
      }
    }
  } catch (err) {
    console.log(`fetch failed: ${err.message}`);
  }
}

async function main() {
  await dump('Foot Mercato -- RSS index page', 'https://www.footmercato.net/flux-rss');
  await dump('Foot Mercato -- news sitemap', 'https://www.footmercato.net/sitemap-news.xml');
  await dump('Foot Mercato -- dedicated Ligue 1 transfers page', 'https://www.footmercato.net/france/ligue-1/transfert');
  await dump('Foot Mercato -- transfers live page', 'https://www.footmercato.net/transferts-en-direct');
  await dump('Top Mercato -- RSS help page', 'https://www.topmercato.com/rss.php?help=1');
  await dump('RSS Mercato aggregator', 'https://rss-mercato.fr/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
