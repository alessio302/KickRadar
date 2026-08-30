const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const URL_TO_CHECK =
  'https://www.transfermarkt.de/geruchtekuche/detail/forum/154/gk_group/nationalCompetitions/gk_wettbewerb_id/L1';

async function tryFetch(label, headers) {
  console.log(`\n=== Attempt: ${label} ===`);
  const res = await fetch(URL_TO_CHECK, { headers });
  console.log('Status:', res.status, res.statusText);
  console.log('Response headers:');
  for (const [k, v] of res.headers.entries()) {
    console.log(` ${k}: ${v}`);
  }
  const html = await res.text();
  console.log('Body length:', html.length);
  if (html.length > 0) {
    console.log('First 500 chars:', html.slice(0, 500));
  }
}

async function main() {
  await tryFetch('plain UA only', { 'User-Agent': UA });

  await tryFetch('full browser-like headers', {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    Referer: 'https://www.google.com/',
  });

  // Also try the plain transfermarkt homepage, to see if the block is
  // site-wide or specific to the Gerüchteküche path.
  const homeRes = await fetch('https://www.transfermarkt.de/', { headers: { 'User-Agent': UA } });
  console.log('\n=== Homepage ===');
  console.log('Status:', homeRes.status);
  const homeHtml = await homeRes.text();
  console.log('Body length:', homeHtml.length);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
