// Third round: confirmed `?matchDate=YYYY-MM-DD&status=LIVE` together
// correctly filters GOAL API's /leagues/{id}/fixtures response down to
// exactly the one live Bundesliga match today (matchDate alone, without
// status, still returned the same unfiltered 1909-total page as `date`
// did). resolveGoalApiIds() needs both already-live AND soon-to-kick-off
// scheduled candidates (see its own findCandidateFixtures() query), so
// this checks whether matchDate+status=SCHEDULED filters correctly too,
// before writing the actual fix to getLeagueFixtures().
const BASE_URL = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';

async function rawCall(path, params) {
  const apiKey = process.env.GOAL_API_KEY;
  if (!apiKey) throw new Error('Missing GOAL_API_KEY env var.');
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  console.log(`  -> ${url.toString()}`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await res.text();
  if (!res.ok) throw new Error(`GOAL API request failed: ${res.status} ${res.statusText} ${body}`);
  return JSON.parse(body);
}

function summarize(data) {
  const items = data.data ?? [];
  console.log(`  data.length=${items.length}, pagination=${JSON.stringify(data.pagination ?? 'NONE')}`);
  for (const m of items) {
    console.log(`    "${m.homeTeamName}" vs "${m.awayTeamName}" matchDate=${m.matchDate} status=${m.matchStatus} round=${m.matchRound}`);
  }
}

async function main() {
  const bundesligaLeagueId = 'cmr77dvgm0002rx06rt2uqxii';
  const today = new Date().toISOString().slice(0, 10);

  console.log(`\n=== matchDate=${today}&status=SCHEDULED ===`);
  summarize(await rawCall(`/leagues/${bundesligaLeagueId}/fixtures`, { matchDate: today, status: 'SCHEDULED' }));

  console.log(`\n=== matchDate=${today}&status=FINISHED ===`);
  summarize(await rawCall(`/leagues/${bundesligaLeagueId}/fixtures`, { matchDate: today, status: 'FINISHED' }));

  console.log(`\n=== matchDate=${today} with NO status at all (re-confirm it alone is not enough) ===`);
  summarize(await rawCall(`/leagues/${bundesligaLeagueId}/fixtures`, { matchDate: today }));

  // Tomorrow, LIVE status shouldn't exist but SCHEDULED should show
  // upcoming fixtures -- sanity-checks that matchDate genuinely varies the
  // result (not just an artifact of today happening to have a LIVE match).
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  console.log(`\n=== matchDate=${tomorrow}&status=SCHEDULED (tomorrow, sanity check) ===`);
  summarize(await rawCall(`/leagues/${bundesligaLeagueId}/fixtures`, { matchDate: tomorrow, status: 'SCHEDULED' }));
}

main().catch((err) => {
  console.error('Diagnose raw GOAL API fixtures (v3) failed:', err);
  process.exitCode = 1;
});
