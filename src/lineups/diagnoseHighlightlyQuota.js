// Read-only: makes exactly one Highlightly /matches call and prints every
// response header, to check whether the API surfaces a rate-limit/quota
// header (X-RateLimit-*, X-Requests-Remaining, etc.) we can use to reason
// about real headroom against the free plan's documented 100 req/day,
// instead of guessing from code-reading alone.
const BASE_URL = process.env.HIGHLIGHTLY_BASE_URL || 'https://soccer.highlightly.net';
const RAPIDAPI_HOST = process.env.HIGHLIGHTLY_RAPIDAPI_HOST || 'soccer.highlightly.net';

async function main() {
  const apiKey = process.env.HIGHLIGHTLY_API_KEY;
  if (!apiKey) throw new Error('Missing HIGHLIGHTLY_API_KEY env var.');

  const today = new Date().toISOString().slice(0, 10);
  const url = new URL(`${BASE_URL}/matches`);
  url.searchParams.set('date', today);
  url.searchParams.set('countryName', 'Germany');

  const res = await fetch(url, {
    headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': RAPIDAPI_HOST },
  });

  console.log('Status:', res.status, res.statusText);
  console.log('Headers:');
  for (const [key, value] of res.headers.entries()) {
    console.log(`  ${key}: ${value}`);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
