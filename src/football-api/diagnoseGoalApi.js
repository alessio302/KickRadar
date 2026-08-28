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
  // GOAL API tracks ~1000 leagues worldwide, and generic names like
  // "Premier League" collide across many countries (England, Kenya,
  // Somalia, Taiwan, women's/junior variants, ...). Scoping the lookup by
  // country avoids trusting a substring match against the wrong homonym.
  const targets = [
    { country: 'Germany', name: 'bundesliga' },
    { country: 'England', name: 'premier league' },
    { country: 'Italy', name: 'serie a' },
    { country: 'France', name: 'ligue 1' },
    { country: 'Spain', name: 'la liga' },
  ];

  console.log('--- Countries ---');
  let countries = [];
  let offset = 0;
  for (let page = 0; page < 5; page++) {
    const resp = await call(`/countries?limit=100&offset=${offset}`);
    if (!resp) break;
    countries = countries.concat(resp.data ?? []);
    if (!resp.pagination?.hasMore) break;
    offset += 100;
  }
  console.log(`Total countries returned: ${countries.length}`);

  for (const target of targets) {
    const country = countries.find((c) => (c.name || '').toLowerCase() === target.country.toLowerCase());
    if (!country) {
      console.log(`${target.country}: not found in countries list.`);
      continue;
    }
    const leaguesResp = await call(`/countries/${country.id}/leagues`);
    const leagues = leaguesResp?.data ?? [];
    const match = leagues.find((l) => (l.name || '').toLowerCase().includes(target.name));
    console.log(
      `${target.country} (countryId=${country.id}): ${leagues.length} leagues -- match: ${
        match ? `${match.id} (apiId=${match.apiId ?? 'n/a'}) "${match.name}"` : 'NOT FOUND'
      }`
    );
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
