// One-off diagnostic, not part of the regular pipeline. Checks whether a
// player's transfermarkt.de profile page (already scraped for its URL via
// playerProfileResolver.js) reliably exposes their current club in the
// HTML, and what the real markup around it looks like -- needed to build
// a proper transfermarkt-based current-club check instead of relying on
// football-data.org's free-tier squad data, which turned out ambiguous
// for a player mid-transfer (Facundo Medina listed on both Marseille's
// and Leverkusen's synced squads at once).
import * as cheerio from 'cheerio';

const TRANSFERMARKT_BASE = 'https://www.transfermarkt.de';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function quickSearchUrl(playerName) {
  return `${TRANSFERMARKT_BASE}/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(playerName)}`;
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
  console.log(`GET ${url} -> ${res.status} ${res.statusText}`);
  return res.text();
}

async function main() {
  const playerName = 'Facundo Medina';
  const searchHtml = await fetchHtml(quickSearchUrl(playerName));
  const $search = cheerio.load(searchHtml);
  const profileHref = $search('a[href*="/profil/spieler/"]').first().attr('href');
  if (!profileHref) {
    console.log('No profile link found in search results -- dumping first 3000 chars of search page:');
    console.log(searchHtml.slice(0, 3000));
    return;
  }
  const profileUrl = new URL(profileHref, TRANSFERMARKT_BASE).toString();
  console.log('Profile URL:', profileUrl);

  const profileHtml = await fetchHtml(profileUrl);
  const $ = cheerio.load(profileHtml);

  // Try a handful of commonly-known transfermarkt selectors for the
  // "current club" info box, log whichever actually finds something.
  const candidates = [
    '.data-header__club a',
    '.data-header__club',
    'span[itemprop="affiliation"] span[itemprop="name"]',
    'span[itemprop="affiliation"]',
    '.data-header__club-info',
  ];
  for (const sel of candidates) {
    const el = $(sel).first();
    console.log(`selector "${sel}": found=${el.length > 0}, text="${el.text().trim()}"`);
  }

  // Also dump a chunk of the raw HTML around the first occurrence of a
  // known label keyword, so the structure is visible even if none of the
  // guessed selectors above hit.
  const marker = profileHtml.indexOf('data-header__club');
  console.log('\n--- Raw HTML around "data-header__club" (400 chars before/after) ---');
  console.log(marker === -1 ? '(marker not found)' : profileHtml.slice(Math.max(0, marker - 400), marker + 800));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
