/**
 * Diagnose whether soccerway.com can be used as a player profile data source.
 * Tests: reachability, anti-bot measures, and available data fields.
 *
 * Test URL: https://www.soccerway.com/player/delli-carri-filippo/QiKjTfpa/transfers/
 */

import https from 'https';
import http from 'http';

const TEST_URL = 'https://www.soccerway.com/player/delli-carri-filippo/QiKjTfpa/transfers/';
const PROFILE_URL = 'https://www.soccerway.com/player/delli-carri-filippo/QiKjTfpa/';

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
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

function extractField(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1]?.trim() || null;
  }
  return null;
}

function extractTransfers(html) {
  const transfers = [];
  const rowPattern = /<tr[^>]*class="[^"]*transfer[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const row = rowMatch[1];
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellPattern.exec(row)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    if (cells.length >= 3) transfers.push(cells);
  }
  return transfers;
}

async function diagnose() {
  console.log('=== Soccerway.com Player Profile Diagnosis ===\n');
  console.log(`Profile URL: ${PROFILE_URL}`);
  console.log(`Transfers URL: ${TEST_URL}\n`);

  // --- Step 1: Reachability ---
  console.log('--- Step 1: Reachability ---');
  let profileRes, transferRes;
  try {
    profileRes = await fetch(PROFILE_URL);
    console.log(`Profile page HTTP status: ${profileRes.status}`);
    console.log(`Content-Type: ${profileRes.headers['content-type'] || 'unknown'}`);
    console.log(`Content-Length: ${profileRes.body.length} bytes`);
  } catch (err) {
    console.log(`Profile page FAILED: ${err.message}`);
    process.exit(1);
  }

  try {
    transferRes = await fetch(TEST_URL);
    console.log(`Transfers page HTTP status: ${transferRes.status}`);
    console.log(`Transfers Content-Length: ${transferRes.body.length} bytes`);
  } catch (err) {
    console.log(`Transfers page FAILED: ${err.message}`);
  }

  // --- Step 2: Anti-bot detection ---
  console.log('\n--- Step 2: Anti-bot / Access Check ---');
  const html = profileRes.body;
  const isCloudflare = html.includes('cloudflare') || html.includes('cf-browser-verification') || profileRes.status === 403 || profileRes.status === 429;
  const isCaptcha = html.toLowerCase().includes('captcha') || html.toLowerCase().includes('recaptcha');
  const isBlocked = html.toLowerCase().includes('access denied') || html.toLowerCase().includes('blocked');
  const hasContent = html.length > 5000;

  console.log(`Cloudflare protection: ${isCloudflare}`);
  console.log(`Captcha detected: ${isCaptcha}`);
  console.log(`Access blocked: ${isBlocked}`);
  console.log(`Has substantial content: ${hasContent}`);

  if (isCloudflare || isCaptcha || isBlocked || !hasContent) {
    console.log('\n⛔ RESULT: Scraping appears to be BLOCKED or page is inaccessible.');
    console.log('Raw response preview (first 500 chars):');
    console.log(html.substring(0, 500));
    return;
  }

  // --- Step 3: Data extraction ---
  console.log('\n--- Step 3: Data Extraction ---');

  const name = extractField(html, [
    /<h1[^>]*class="[^"]*player[^"]*"[^>]*>([^<]+)<\/h1>/i,
    /<h1[^>]*>([^<]+)<\/h1>/i,
    /itemprop="name"[^>]*>([^<]+)</i,
  ]);
  console.log(`Name: ${name || 'NOT FOUND'}`);

  const birthdate = extractField(html, [
    /itemprop="birthDate"[^>]*content="([^"]+)"/i,
    /Date of birth[^<]*<\/[^>]+>\s*<[^>]+>([^<]+)</i,
    /(\d{1,2}[-./]\d{1,2}[-./]\d{2,4})/,
  ]);
  console.log(`Birthdate: ${birthdate || 'NOT FOUND'}`);

  const nationality = extractField(html, [
    /itemprop="nationality"[^>]*>([^<]+)</i,
    /Nationality[^<]*<\/[^>]+>\s*<[^>]+>([^<]+)</i,
    /flag[^>]*title="([^"]+)"/i,
  ]);
  console.log(`Nationality: ${nationality || 'NOT FOUND'}`);

  const position = extractField(html, [
    /itemprop="jobTitle"[^>]*>([^<]+)</i,
    /Position[^<]*<\/[^>]+>\s*<[^>]+>([^<]+)</i,
  ]);
  console.log(`Position: ${position || 'NOT FOUND'}`);

  const photo = extractField(html, [
    /<img[^>]*class="[^"]*player[^"]*"[^>]*src="([^"]+)"/i,
    /itemprop="image"[^>]*src="([^"]+)"/i,
    /<img[^>]*src="([^"]*player[^"]*\.(jpg|png|webp))"/i,
  ]);
  console.log(`Photo URL: ${photo || 'NOT FOUND'}`);

  const club = extractField(html, [
    /itemprop="memberOf"[^>]*>([^<]+)</i,
    /Current club[^<]*<\/[^>]+>\s*<[^>]+>([^<]+)</i,
  ]);
  console.log(`Current Club: ${club || 'NOT FOUND'}`);

  // --- Step 4: Transfer data ---
  if (transferRes && transferRes.status === 200 && transferRes.body.length > 1000) {
    console.log('\n--- Step 4: Transfer History ---');
    const transfers = extractTransfers(transferRes.body);
    if (transfers.length > 0) {
      console.log(`Found ${transfers.length} transfer row(s):`);
      transfers.slice(0, 5).forEach((row, i) => console.log(`  [${i + 1}] ${JSON.stringify(row)}`));
    } else {
      console.log('No structured transfer data found in table rows.');
      const hasTransferSection = transferRes.body.toLowerCase().includes('transfer');
      console.log(`Transfer section present: ${hasTransferSection}`);
    }
  }

  // --- Step 5: Structured data check ---
  console.log('\n--- Step 5: Structured / Machine-Readable Data ---');
  const hasJsonLd = html.includes('application/ld+json');
  const hasMicrodata = html.includes('itemtype') && html.includes('schema.org');
  const hasOpenGraph = html.includes('og:title');
  console.log(`JSON-LD present: ${hasJsonLd}`);
  console.log(`Schema.org Microdata present: ${hasMicrodata}`);
  console.log(`OpenGraph tags present: ${hasOpenGraph}`);

  if (hasJsonLd) {
    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const data = JSON.parse(jsonLdMatch[1]);
        console.log('JSON-LD data:', JSON.stringify(data, null, 2).substring(0, 800));
      } catch (_) {
        console.log('JSON-LD parse failed');
      }
    }
  }

  // --- Summary ---
  console.log('\n=== SUMMARY ===');
  const fields = { name, birthdate, nationality, position, photo, club };
  const found = Object.entries(fields).filter(([, v]) => v !== null).map(([k]) => k);
  const missing = Object.entries(fields).filter(([, v]) => v === null).map(([k]) => k);
  console.log(`Fields found (${found.length}/6): ${found.join(', ') || 'none'}`);
  console.log(`Fields missing (${missing.length}/6): ${missing.join(', ') || 'none'}`);
  console.log(`Structured data: ${hasJsonLd ? 'JSON-LD' : hasMicrodata ? 'Microdata' : 'none'}`);

  const usable = !isCloudflare && !isCaptcha && !isBlocked && hasContent && found.length >= 2;
  console.log(`\n${usable ? '✅ RESULT: Soccerway APPEARS USABLE as data source.' : '⚠️  RESULT: Limited data extractable — manual review recommended.'}`);
  console.log('Note: This is a basic HTML fetch test. Real-world reliability depends on rate limits and ToS.');
}

diagnose().catch(err => {
  console.error('Diagnosis failed:', err.message);
  process.exit(1);
});
