import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const LIVE_BLOG_URL =
  'https://www.skysports.com/football/live-blog/11661/12476234/transfer-centre-live-football-transfer-news-updates-and-rumours';

async function main() {
  const res = await fetch(LIVE_BLOG_URL, { headers: { 'User-Agent': UA } });
  const html = await res.text();
  const $ = cheerio.load(html);

  const scripts = $('script[type="application/ld+json"]');
  console.log('Number of application/ld+json scripts found:', scripts.length);

  scripts.each((i, el) => {
    const raw = $(el).contents().text();
    console.log(`\n--- script ${i}: length ${raw.length} ---`);
    console.log('First 200 chars:', raw.slice(0, 200));
    console.log('Last 200 chars:', raw.slice(-200));
    try {
      const parsed = JSON.parse(raw);
      console.log('Parsed OK. Is array:', Array.isArray(parsed));
      if (Array.isArray(parsed)) {
        console.log('Array length:', parsed.length);
        console.log('First element @type:', parsed[0]?.['@type']);
        const types = [...new Set(parsed.map((p) => p?.['@type']))];
        console.log('Distinct @type values in array:', types);
      } else {
        console.log('Top-level keys:', Object.keys(parsed));
        console.log('Top-level @type:', parsed['@type']);
      }
    } catch (err) {
      console.log('JSON.parse FAILED:', err.message);
    }
  });
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
