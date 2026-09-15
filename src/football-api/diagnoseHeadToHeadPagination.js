import { UEFA_COMPETITIONS } from '../config/leagues.js';

// Follow-up to diagnoseHeadToHeadTeamMatch.js (since removed): that run
// showed /leagues/:id/teams caps out at exactly 50 results for every UEFA
// competition, and that those 50 are mostly small qualifying-round clubs
// (Ararat-Armenia, Iberia 1999, Atert Bissen, ...) -- current league-phase
// giants (Real Madrid, Bayern, PSG, ...) are missing entirely, meaning
// whatever this cap includes isn't even alphabetically/usefully ordered.
// This tests whether the endpoint supports pagination at all (page/limit/
// offset query params) to get past that cap.

const BASE_URL = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';

async function rawCall(path) {
  const apiKey = process.env.GOAL_API_KEY;
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) };
}

async function main() {
  const ucl = UEFA_COMPETITIONS.find((c) => c.slug === 'champions-league');
  const leagueId = ucl.goalApiLeagueId;

  for (const suffix of ['', '?page=2', '?page=1&limit=100', '?limit=200', '?offset=50']) {
    const path = `/leagues/${leagueId}/teams${suffix}`;
    console.log(`\n--- GET ${path} ---`);
    const r = await rawCall(path);
    console.log('status', r.status);
    const teams = r.body?.data ?? [];
    console.log('count:', teams.length);
    console.log('first 5:', teams.slice(0, 5).map((t) => t.name));
    console.log('last 5:', teams.slice(-5).map((t) => t.name));
    console.log('meta (non-data keys):', Object.fromEntries(Object.entries(r.body).filter(([k]) => k !== 'data')));
    console.log('has Real Madrid?', teams.some((t) => /real madrid/i.test(t.name)));
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
