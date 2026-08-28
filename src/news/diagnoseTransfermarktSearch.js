// One-off: inspects transfermarkt.de's quicksearch RESULT PAGE structure for
// a handful of known-ambiguous names, so playerProfileResolver.js's planned
// disambiguation logic (pick the search result whose current club matches
// what the article already named, instead of blindly taking the first hit)
// can be built against the real markup instead of guessed selectors. Read-only,
// no DB writes. Delete this file + its paired workflow once the real markup
// is confirmed and the resolver is updated.
import * as cheerio from 'cheerio';

const TRANSFERMARKT_BASE = 'https://www.transfermarkt.de';
const NAMES = ['Ronaldo', 'Vitinha', 'João', 'Danilo'];

function quickSearchUrl(playerName) {
  return `${TRANSFERMARKT_BASE}/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(playerName)}`;
}

async function inspect(playerName) {
  const url = quickSearchUrl(playerName);
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  console.log(`\n=== "${playerName}" -> ${url} (HTTP ${res.status}) ===`);
  if (!res.ok) return;
  const html = await res.text();
  const $ = cheerio.load(html);

  const profileLinks = $('a[href*="/profil/spieler/"]');
  console.log(`profile links found: ${profileLinks.length}`);

  // Dump every table on the page that contains at least one profile link,
  // row by row, with every cell's text -- we don't know yet which table/row
  // shape holds the club column, so print everything and eyeball it.
  $('table').each((tableIdx, table) => {
    const $table = $(table);
    if ($table.find('a[href*="/profil/spieler/"]').length === 0) return;
    console.log(`--- table #${tableIdx} (class="${$table.attr('class')}") ---`);
    $table.find('tr').each((rowIdx, row) => {
      const $row = $(row);
      const link = $row.find('a[href*="/profil/spieler/"]').first();
      if (link.length === 0) return;
      const cells = $row
        .find('td')
        .map((_, td) => $(td).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter(Boolean);
      console.log(`row ${rowIdx}: name="${link.text().trim()}" href="${link.attr('href')}" cells=${JSON.stringify(cells)}`);
    });
  });
}

async function main() {
  for (const name of NAMES) {
    try {
      await inspect(name);
    } catch (err) {
      console.error(`"${name}" failed:`, err.message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
