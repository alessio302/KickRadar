// Second follow-up (after diagnoseGoalApiIdResolution.js showed GOAL API's
// /leagues/{id}/fixtures?date=... response for Bundesliga/Ligue 1 today
// did NOT include the actual match kicking off today at all). Confirmed by
// this script's first version: the response carries pagination
// {total:1909, limit:50, offset:0, hasMore:true} for Bundesliga -- WAY more
// than one season's fixtures for an 18-team league -- and is IDENTICAL
// whether `date` is passed or not, sorted by matchRound descending
// (round 34, the season's LAST round, on page 1; round 29 around
// offset=50). The `date` query param this codebase sends does nothing;
// GOAL API's own field for a fixture's calendar date is called `matchDate`
// (confirmed in the raw fixture shape: "matchDate": "2027-05-22"), not
// `date`. This second version tests whether `matchDate` is the query
// param GOAL API actually expects.
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

function summarize(data, today) {
  const items = data.data ?? [];
  console.log(`  data.length=${items.length}, pagination=${JSON.stringify(data.pagination ?? 'NONE')}`);
  const matchDates = [...new Set(items.map((m) => m.matchDate))].sort();
  console.log(`  distinct matchDate values in this page: ${JSON.stringify(matchDates.slice(0, 10))}${matchDates.length > 10 ? ` (+${matchDates.length - 10} more)` : ''}`);
  const todays = items.filter((m) => m.matchDate === today);
  console.log(`  fixtures with matchDate === ${today}: ${todays.length}`);
  for (const m of todays) {
    console.log(`    "${m.homeTeamName}" vs "${m.awayTeamName}" status=${m.matchStatus} round=${m.matchRound}`);
  }
  return todays;
}

async function main() {
  const bundesligaLeagueId = 'cmr77dvgm0002rx06rt2uqxii';
  const today = new Date().toISOString().slice(0, 10);

  console.log(`\n=== Attempt 1: ?matchDate=${today} ===`);
  const byMatchDate = await rawCall(`/leagues/${bundesligaLeagueId}/fixtures`, { matchDate: today });
  summarize(byMatchDate, today);

  console.log(`\n=== Attempt 2: ?date=${today} (current code's param name, for comparison) ===`);
  const byDate = await rawCall(`/leagues/${bundesligaLeagueId}/fixtures`, { date: today });
  summarize(byDate, today);

  console.log(`\n=== Attempt 3: ?matchDate=${today}&status=LIVE (in case a status filter also exists) ===`);
  const byMatchDateLive = await rawCall(`/leagues/${bundesligaLeagueId}/fixtures`, { matchDate: today, status: 'LIVE' });
  summarize(byMatchDateLive, today);

  console.log(`\n=== Attempt 4: ?dateFrom=${today}&dateTo=${today} ===`);
  const byRange = await rawCall(`/leagues/${bundesligaLeagueId}/fixtures`, { dateFrom: today, dateTo: today });
  summarize(byRange, today);
}

main().catch((err) => {
  console.error('Diagnose raw GOAL API fixtures (v2) failed:', err);
  process.exitCode = 1;
});
