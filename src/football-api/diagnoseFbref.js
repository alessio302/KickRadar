/**
 * Diagnose whether fbref.com can be used as a player profile stats source
 * (season-by-season stats, current + previous season).
 *
 * Test URL: https://fbref.com/en/players/6928979a/Nicolo-Barella
 */

import https from 'https';
import http from 'http';

const TEST_URL = 'https://fbref.com/en/players/6928979a/Nicolo-Barella';

function fetch(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

// fbref (Sports Reference) famously ships many of its stat tables inside
// HTML comments (<!-- <table>...</table> -->) to discourage naive
// scraping/rendering by simple parsers -- they're still fully present in
// the raw response, just need unwrapping before a normal table-row regex
// can see them.
function uncommentTables(html) {
  return html.replace(/<!--([\s\S]*?)-->/g, (_, inner) => (inner.includes('<table') ? inner : ''));
}

function extractTable(html, tableId) {
  const re = new RegExp(`<table[^>]*id="${tableId}"[^>]*>([\\s\\S]*?)</table>`, 'i');
  const match = html.match(re);
  return match ? match[1] : null;
}

function extractRows(tableHtml) {
  if (!tableHtml) return [];
  const rows = [];
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(tableHtml)) !== null) {
    const row = rowMatch[1];
    const cells = {};
    const cellPattern = /<t[hd][^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(row)) !== null) {
      const [, stat, raw] = cellMatch;
      cells[stat] = raw.replace(/<[^>]+>/g, '').trim();
    }
    if (Object.keys(cells).length > 0) rows.push(cells);
  }
  return rows;
}

async function diagnose() {
  console.log('=== fbref.com Player Profile Stats Diagnosis ===\n');
  console.log(`Test URL: ${TEST_URL}\n`);

  // --- Step 1: Reachability ---
  console.log('--- Step 1: Reachability ---');
  let res;
  try {
    res = await fetch(TEST_URL);
    console.log(`HTTP status: ${res.status}`);
    console.log(`Content-Type: ${res.headers['content-type'] || 'unknown'}`);
    console.log(`Content-Length: ${res.body.length} bytes`);
  } catch (err) {
    console.log(`Request FAILED: ${err.message}`);
    process.exit(1);
  }

  // --- Step 2: Anti-bot / access check ---
  console.log('\n--- Step 2: Anti-bot / Access Check ---');
  const html = res.body;
  const isCloudflare = html.includes('cf-browser-verification') || res.status === 403 || res.status === 429;
  const isRateLimited = res.status === 429 || /rate limit/i.test(html.slice(0, 3000));
  const isCaptcha = /<div[^>]*class="[^"]*g-recaptcha/i.test(html) || /data-sitekey=/i.test(html);
  const isBlocked = /<title[^>]*>\s*(Access Denied|403 Forbidden|Blocked)\s*<\/title>/i.test(html);
  const hasContent = html.length > 20000;
  const hasPlayerTitle = /<title[^>]*>[^<]*Barella[^<]*<\/title>/i.test(html);

  console.log(`Cloudflare protection: ${isCloudflare}`);
  console.log(`Rate limited (429): ${isRateLimited}`);
  console.log(`Captcha challenge: ${isCaptcha}`);
  console.log(`Access blocked: ${isBlocked}`);
  console.log(`Has substantial content: ${hasContent}`);
  console.log(`Has player page title: ${hasPlayerTitle}`);

  if (isCloudflare || isRateLimited || isCaptcha || isBlocked || !hasContent) {
    console.log('\n⛔ RESULT: Scraping appears to be BLOCKED or page is inaccessible.');
    console.log('Raw response preview (first 800 chars):');
    console.log(html.substring(0, 800));
    return;
  }

  const unwrapped = uncommentTables(html);

  // --- Step 3: Locate season-by-season stats tables ---
  console.log('\n--- Step 3: Season Stats Tables ---');
  // Guessed fbref table ids for a player page's "Standard Stats" (domestic
  // league) block -- these are stable ids fbref uses across player pages,
  // not scraped/discovered from this specific page.
  const candidateTableIds = [
    'stats_standard_dom_lg',
    'stats_standard',
    'stats_shooting_dom_lg',
    'stats_playing_time_dom_lg',
  ];

  for (const id of candidateTableIds) {
    const tableHtml = extractTable(unwrapped, id) || extractTable(html, id);
    console.log(`Table "${id}": ${tableHtml ? 'FOUND' : 'not found'}`);
  }

  const standardTable = extractTable(unwrapped, 'stats_standard_dom_lg') || extractTable(html, 'stats_standard_dom_lg');
  if (standardTable) {
    const rows = extractRows(standardTable);
    console.log(`\nRows parsed from stats_standard_dom_lg: ${rows.length}`);
    rows.slice(-4).forEach((row, i) => {
      console.log(`  [row ${i}] season=${row.season || row.year_id || '?'} squad=${row.team || row.squad || '?'} goals=${row.goals || '?'} assists=${row.assists || '?'} minutes=${row.minutes || '?'}`);
    });
    if (rows.length > 0) {
      console.log('\nFull field set of last row:');
      console.log(JSON.stringify(rows[rows.length - 1], null, 2));
    }
  } else {
    console.log('\nNo standard-stats table found by guessed id -- listing all table ids present instead:');
    const allIds = [...unwrapped.matchAll(/<table[^>]*id="([^"]+)"/gi)].map((m) => m[1]);
    console.log(allIds.join(', ') || 'none found');
  }

  // --- Step 4: Basic profile fields ---
  console.log('\n--- Step 4: Basic Profile Fields ---');
  const name = (html.match(/<h1[^>]*>[\s\S]*?<span>([^<]+)<\/span>/i) || [])[1]?.trim();
  console.log(`Name: ${name || 'NOT FOUND'}`);
  const metaBlock = (html.match(/<div[^>]*id="meta"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) || [])[1];
  console.log(`Meta block present: ${!!metaBlock}`);

  console.log('\n=== SUMMARY ===');
  console.log('Note: This is a basic HTML fetch test. Real-world reliability depends on rate limits (fbref enforces ~10 req/min per IP) and ToS.');
}

diagnose().catch((err) => {
  console.error('Diagnosis failed:', err.message);
  process.exit(1);
});
