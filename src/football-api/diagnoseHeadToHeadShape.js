import { UEFA_COMPETITIONS, LEAGUES } from '../config/leagues.js';

// Follow-up to diagnoseHeadToHeadEndpoints.js (already removed, PR #108):
// that run confirmed GOAL API's /h2h/:team1Id/:team2Id/direct returns real
// per-match data, but the log tail truncated the JSON before the full
// field list came through. This dumps ONE full, untruncated match object
// (both a domestic and a Europa pairing) to nail down the exact field
// names (match_hometeam_score vs match_home_score, etc.) before writing
// syncEuropeanHeadToHead.js's parsing logic against a guess.

const BASE_URL = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';

async function rawCall(path) {
  const apiKey = process.env.GOAL_API_KEY;
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) };
}

async function dumpOne(label, leagueId, namePattern = null, matchIndex = 0) {
  console.log(`\n=== ${label} ===`);
  const teamsRes = await rawCall(`/leagues/${leagueId}/teams`);
  const teams = teamsRes.body.data ?? [];
  let t1, t2;
  if (namePattern) {
    [t1, t2] = namePattern.map((re) => teams.find((t) => re.test(t.name)));
  } else {
    [t1, t2] = teams;
  }
  if (!t1 || !t2) {
    console.log('Not enough teams to test with.');
    return;
  }
  console.log('Pairing:', t1.name, 'vs', t2.name);
  const r = await rawCall(`/h2h/${t1.id}/${t2.id}/direct`);
  console.log('status', r.status);
  const matches = r.body?.data?.matches ?? [];
  console.log('match count:', matches.length);
  if (matches[matchIndex]) {
    console.log('Full match object (index', matchIndex, '):');
    console.log(JSON.stringify(matches[matchIndex], null, 2));
  } else {
    console.log('No match at that index; full response:');
    console.log(JSON.stringify(r.body, null, 2));
  }
}

async function main() {
  const serieA = LEAGUES.find((l) => l.slug === 'serie-a');
  await dumpOne('Domestic (Serie A)', serieA.goalApiLeagueId, [/juventus/i, /^milan$|a\.?c\.?\s*milan/i]);

  const uel = UEFA_COMPETITIONS.find((c) => c.slug === 'europa-league');
  await dumpOne('Europa League', uel.goalApiLeagueId);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
