import * as cheerio from 'cheerio';

// Read-only diagnostic (no DB writes) for "la-liga: { inserted: 0, skipped: 0,
// merged: 0 }" showing up in every recent news-scraper run -- that specific
// shape means marca.js's fetchLatest() returned an EMPTY array (an actual
// fetch failure would show up as `{ error: ... }` instead, via
// runNewsScraper.js's per-league try/catch). So either the page no longer
// returns 200, the confirmed-live selector ('.ue-c-cover-content__link', see
// marca.js) no longer matches anything, or the response body itself changed
// shape (cookie wall / bot-block page) while still returning 200. Run via
// workflow_dispatch and share the logs -- this sandbox has no live network
// access to marca.com.
const LIST_URL = 'https://www.marca.com/futbol/mercado-fichajes.html';
const SELECTOR = '.ue-c-cover-content__link';

async function run() {
  const res = await fetch(LIST_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  console.log('status:', res.status, res.statusText);
  console.log('content-type:', res.headers.get('content-type'));
  const html = await res.text();
  console.log('html length:', html.length);

  const $ = cheerio.load(html);
  console.log('<title>:', $('title').text());

  const matches = $(SELECTOR);
  console.log(`selector "${SELECTOR}" matches:`, matches.length);

  if (matches.length === 0) {
    // Sanity checks: is this even football content, or a cookie/consent
    // interstitial, or a totally different template?
    console.log('body text sample (first 500 chars):', $('body').text().replace(/\s+/g, ' ').trim().slice(0, 500));
    console.log('any <article> tags:', $('article').length);
    console.log('any elements with class containing "cover-content":', $('[class*="cover-content"]').length);
    console.log('any elements with class containing "consent" or "cookie":', $('[class*="consent"], [class*="cookie"]').length);
  } else {
    matches.slice(0, 5).each((i, el) => {
      console.log(`  [${i}] text="${$(el).text().trim().slice(0, 80)}" href="${$(el).attr('href')}"`);
    });
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('fetch/parse failed:', err);
    process.exit(1);
  });
