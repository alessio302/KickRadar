// Read-only: checks whether GOAL API's free tier can replace Highlightly
// for match_events (goals/cards/substitutions). Known ground truth to
// validate against: FC Bayern München 5-1 VfB Stuttgart, 2026-08-28,
// Bundesliga matchday 1.
const BASE_URL = 'https://api.goal-api.com/v1';

async function call(path) {
  const apiKey = process.env.GOAL_API_KEY;
  if (!apiKey) throw new Error('Missing GOAL_API_KEY env var.');
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await res.text();
  const rateHeaders = {};
  for (const [k, v] of res.headers.entries()) {
    if (k.toLowerCase().startsWith('x-ratelimit')) rateHeaders[k] = v;
  }
  if (!res.ok) {
    console.error(`  -> ${path} failed: ${res.status} ${res.statusText} ${body}`);
    return null;
  }
  console.log(`  -> ${path}: ${res.status}, rate headers:`, JSON.stringify(rateHeaders));
  return JSON.parse(body);
}

async function main() {
  console.log('--- Leagues ---');
  const leaguesResp = await call('/leagues?limit=200');
  const leagues = leaguesResp?.data ?? [];
  console.log(`Total leagues returned: ${leagues.length}`);
  const wanted = ['bundesliga', 'serie a', 'premier league', 'ligue 1', 'la liga', 'laliga'];
  const matches = leagues.filter((l) => wanted.some((w) => (l.name || '').toLowerCase().includes(w)));
  for (const l of matches) console.log(`  ${l.id} (apiId=${l.apiId ?? 'n/a'}): ${l.name} -- country=${l.country ?? l.countryName ?? '?'}`);

  const bundesliga = matches.find((l) => (l.name || '').toLowerCase().includes('bundesliga'));
  if (!bundesliga) {
    console.log('Could not find Bundesliga in the leagues list -- stopping here.');
    return;
  }

  console.log('--- Bundesliga fixtures for 2026-08-28 ---');
  const fixturesResp = await call(`/leagues/${bundesliga.id}/fixtures?date=2026-08-28`);
  const fixtures = fixturesResp?.data ?? [];
  console.log(`Fixtures returned: ${fixtures.length}`);
  for (const f of fixtures) console.log(`  ${f.id}: ${f.homeTeam?.name ?? f.homeTeamName} vs ${f.awayTeam?.name ?? f.awayTeamName} -- status=${f.status}`);

  const match = fixtures.find(
    (f) => /bayern/i.test(f.homeTeam?.name ?? f.homeTeamName ?? '') && /stuttgart/i.test(f.awayTeam?.name ?? f.awayTeamName ?? '')
  );
  if (!match) {
    console.log('Could not find Bayern-Stuttgart in the fixtures list -- trying /fixtures/date instead.');
    const altResp = await call('/fixtures/date/2026-08-28');
    const alt = (altResp?.data ?? []).filter(
      (f) => /bayern/i.test(f.homeTeam?.name ?? f.homeTeamName ?? '') && /stuttgart/i.test(f.awayTeam?.name ?? f.awayTeamName ?? '')
    );
    console.log('Matches found via /fixtures/date:', JSON.stringify(alt, null, 2));
    return;
  }

  console.log(`Found fixture id: ${match.id}`);
  console.log('--- Fixture details ---');
  console.log(JSON.stringify(await call(`/fixtures/${match.id}`), null, 2));

  console.log('--- Events ---');
  console.log(JSON.stringify(await call(`/fixtures/${match.id}/events`), null, 2));

  console.log('--- Cards ---');
  console.log(JSON.stringify(await call(`/fixtures/${match.id}/cards`), null, 2));

  console.log('--- Substitutions ---');
  console.log(JSON.stringify(await call(`/fixtures/${match.id}/substitutions`), null, 2));

  console.log('--- Lineups (bonus check) ---');
  console.log(JSON.stringify(await call(`/fixtures/${match.id}/lineups`), null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
