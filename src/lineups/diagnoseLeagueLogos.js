// Temporary diagnostic: does GOAL API's league data include a logo/badge
// image URL? Checking the fixtures endpoint's embedded league object (same
// endpoint syncFixtures.js/syncLineups.js already call) since there's no
// dedicated /leagues/:id endpoint documented -- if the league object here
// carries no logo field, GOAL API likely doesn't expose one at all.
const BASE_URL = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';
const apiKey = process.env.GOAL_API_KEY;

async function main() {
  const leagueId = 'cmr77dvpd006yrx06zig7907g'; // Serie A, from config/leagues.js
  const url = new URL(`${BASE_URL}/leagues/${leagueId}/fixtures`);
  url.searchParams.set('date', '2026-08-30');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await res.text();
  console.log('status:', res.status);
  const parsed = JSON.parse(body);
  const first = parsed.data?.[0];
  console.log('first fixture keys:', first ? Object.keys(first) : null);
  console.log('league field:', JSON.stringify(first?.league, null, 2));
  console.log('home team field (for comparison, clubs have a badge):', JSON.stringify(first?.homeTeam, null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
