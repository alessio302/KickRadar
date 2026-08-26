// Read-only diagnostic: confirms football-data.org's global (non-competition-
// scoped) /v4/matches endpoint works with a comma-separated `competitions`
// filter and a `status=LIVE` filter, in ONE request covering all 5 tracked
// leagues -- needed to design live-score polling within the free tier's
// 10 req/min budget. Prints the raw shape. No DB access, no writes.
const BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';
const COMPETITION_IDS = [2019, 2002, 2021, 2015, 2014];

async function call(path, params) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw new Error('Missing FOOTBALL_DATA_API_KEY env var.');
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
  const body = await res.text();
  console.log(`GET ${url} -> ${res.status}`);
  if (!res.ok) {
    console.log(body);
    return null;
  }
  return JSON.parse(body);
}

async function main() {
  const live = await call('/matches', { competitions: COMPETITION_IDS.join(','), status: 'LIVE' });
  console.log('--- status=LIVE ---');
  console.log('count:', live?.matches?.length ?? 'n/a');
  if (live?.matches?.[0]) console.log(JSON.stringify(live.matches[0], null, 2));

  const todayIso = new Date().toISOString().slice(0, 10);
  const today = await call('/matches', {
    competitions: COMPETITION_IDS.join(','),
    dateFrom: todayIso,
    dateTo: todayIso,
  });
  console.log('--- today, all statuses ---');
  console.log('count:', today?.matches?.length ?? 'n/a');
  for (const m of today?.matches ?? []) {
    console.log(m.id, m.status, m.utcDate, m.homeTeam?.name, 'vs', m.awayTeam?.name, JSON.stringify(m.score));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
