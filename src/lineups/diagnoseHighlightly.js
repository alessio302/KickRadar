// Read-only smoke test, no DB writes. Answers two questions in one run
// (to avoid another guess-then-wait-for-a-fresh-log round trip):
//
// 1. Which auth header shape does this key actually need? Highlightly's
//    own docs/blog content contradicts itself between their two product
//    lines (native highlightly.net signup vs. RapidAPI marketplace) --
//    confirmed live: "Authorization: Bearer" alone got "403 Missing
//    mandatory HTTP Headers" from the native host (soccer.highlightly.net),
//    even though that's what their native-platform docs say to use.
// 2. Once auth works: does the FREE plan return CURRENT SEASON match data
//    at all? API-Football looked just as good on paper and turned out to
//    hard-block the current season on its free tier entirely (see
//    src/football-api/client.js's history) -- no point building the full
//    lineups sync before ruling that out here too.
const BASE_URL = process.env.HIGHLIGHTLY_BASE_URL || 'https://soccer.highlightly.net';

function headerVariants(apiKey) {
  return [
    { label: 'Authorization: Bearer', headers: { Authorization: `Bearer ${apiKey}` } },
    { label: 'x-api-key', headers: { 'x-api-key': apiKey } },
    { label: 'x-rapidapi-key + x-rapidapi-host: soccer.highlightly.net', headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'soccer.highlightly.net' } },
    { label: 'Authorization: Bearer + x-rapidapi-host', headers: { Authorization: `Bearer ${apiKey}`, 'x-rapidapi-host': 'soccer.highlightly.net' } },
  ];
}

async function tryVariant(variant, path, params) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  const res = await fetch(url, { headers: variant.headers });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

async function findWorkingVariant(apiKey) {
  const dateStr = toDateString(new Date());
  for (const variant of headerVariants(apiKey)) {
    console.log(`\n--- trying headers: ${variant.label} ---`);
    const result = await tryVariant(variant, '/matches', { date: dateStr });
    console.log(`  ${result.status}: ${result.body.slice(0, 300)}`);
    if (result.ok) return variant;
  }
  return null;
}

async function run() {
  const apiKey = process.env.HIGHLIGHTLY_API_KEY;
  if (!apiKey) throw new Error('Missing HIGHLIGHTLY_API_KEY env var.');

  console.log('=== Probing auth header variants against /matches ===');
  const workingVariant = await findWorkingVariant(apiKey);
  if (!workingVariant) {
    console.log('\nNone of the tried header combinations worked. Check the raw error bodies above -- the real answer is usually in there (auth docs link, or a plan/subscription message).');
    return;
  }
  console.log(`\nWorking header shape: ${workingVariant.label}`);

  console.log('\n=== Fetching matches for a few dates with the working headers ===');
  const today = new Date();
  const allMatches = [];
  for (const offsetDays of [0, 2, 5]) {
    const dateStr = toDateString(new Date(today.getTime() + offsetDays * 24 * 60 * 60 * 1000));
    console.log(`\n--- date=${dateStr} ---`);
    const result = await tryVariant(workingVariant, '/matches', { date: dateStr });
    console.log(`  ${result.status}`);
    if (!result.ok) {
      console.log(`  ${result.body.slice(0, 500)}`);
      continue;
    }
    const data = JSON.parse(result.body);
    const matches = Array.isArray(data) ? data : data.matches || data.data || [];
    console.log(`  ${matches.length} matches (response shape: ${Array.isArray(data) ? 'array' : Object.keys(data).join(', ')})`);
    for (const m of matches.slice(0, 10)) console.log('   ', JSON.stringify(m).slice(0, 300));
    allMatches.push(...matches);
  }

  if (allMatches.length === 0) {
    console.log('\nNo matches returned for any tried date -- either the free plan blocks current-season data (as API-Football did), or /matches needs different params (league/season) that weren\'t guessed here. Check the raw responses above.');
    return;
  }

  const sample = allMatches[0];
  const matchId = sample.id ?? sample.matchId ?? sample.match_id;
  console.log(`\n=== GET /lineups/${matchId} (first match found) ===`);
  if (!matchId) {
    console.log('Could not find an id field on the sample match object -- inspect the JSON logged above to find the right field name.');
    return;
  }
  const result = await tryVariant(workingVariant, `/lineups/${matchId}`, {});
  console.log(`  ${result.status}`);
  console.log(result.body.slice(0, 2000));
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
