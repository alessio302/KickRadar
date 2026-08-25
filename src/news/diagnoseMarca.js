import * as cheerio from 'cheerio';

// Read-only diagnostic (no DB writes) for wiring up marca.js as the La Liga
// news source. This sandbox has no general internet access to marca.com to
// confirm the real DOM structure up front (same situation every other
// source here started from -- see README), so this fetches the candidate
// "Mercado de Fichajes" page directly and tries several plausible selectors,
// rather than committing to one guess blind. Run via workflow_dispatch (see
// diagnose-marca.yml) and read the logs to pick the selector that actually
// works, then set it as marca.js's default (or MARCA_ITEM_SELECTOR).
const CANDIDATE_URLS = [
  'https://www.marca.com/futbol/mercado-fichajes.html',
  'https://www.marca.com/futbol/mercado-fichajes/laliga.html',
];

const CANDIDATE_SELECTORS = [
  'article a[href*="/futbol/"]',
  'article a[href*="/laliga/"]',
  '.ue-c-cover-content__link',
  'h2 a[href*="/futbol/"]',
  'h2 a',
  '.ue-c-list-content-with-title__item a',
  'a[href*="/futbol/"]',
];

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
  });
  return { status: res.status, ok: res.ok, html: res.ok ? await res.text() : '' };
}

async function run() {
  for (const url of CANDIDATE_URLS) {
    console.log(`\n=== GET ${url} ===`);
    let result;
    try {
      result = await fetchHtml(url);
    } catch (err) {
      console.error(`fetch failed: ${err.message}`);
      continue;
    }
    console.log(`status=${result.status}`);
    if (!result.ok) continue;
    console.log(`html length=${result.html.length}`);

    const $ = cheerio.load(result.html);
    const titleTag = $('title').text().trim();
    console.log(`<title>: ${titleTag}`);

    for (const selector of CANDIDATE_SELECTORS) {
      const els = $(selector);
      const items = [];
      els.each((_, el) => {
        const title = $(el).text().trim();
        const href = $(el).attr('href');
        if (title && href) items.push({ title, href });
      });
      // de-dupe by href (same link often matched twice: image + headline anchor)
      const seen = new Set();
      const unique = items.filter((i) => (seen.has(i.href) ? false : (seen.add(i.href), true)));
      console.log(`  [${selector}] ${els.length} matched, ${unique.length} unique with text+href`);
      for (const item of unique.slice(0, 8)) {
        console.log(`      - "${item.title}" -> ${item.href}`);
      }
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
