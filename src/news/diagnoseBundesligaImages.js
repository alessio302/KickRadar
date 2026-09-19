// Temporary diagnostic (per this project's usual pattern) -- follow-up to
// the previous run: kicker.de returns HTTP 202 with only 2403 bytes and
// zero og:image tags for every checked article -- much smaller than a
// real article page, so this isn't a read-cap issue like bundesliga.com's
// was. Dumps the raw response body to see what we're actually getting
// (a bot-check/consent page, a redirect stub, etc.), plus response headers
// that might explain it (redirect location, set-cookie, server name).
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const URL = 'https://www.kicker.de/wer-uebertraegt-vfb-stuttgart-gegen-borussia-dortmund-live-im-tv-und-stream-1253315/artikel#omrss';

async function main() {
  const res = await fetch(URL, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
  });
  console.log('status:', res.status, res.statusText);
  console.log('headers:');
  for (const [k, v] of res.headers.entries()) console.log(`  ${k}: ${v}`);
  const body = await res.text();
  console.log('\nbody:\n', body);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
