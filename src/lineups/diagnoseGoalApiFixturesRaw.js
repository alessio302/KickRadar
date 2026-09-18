// Second follow-up (after diagnoseGoalApiIdResolution.js showed GOAL API's
// /leagues/{id}/fixtures?date=... response for Bundesliga/Ligue 1 today
// did NOT include the actual match kicking off today at all -- Bayern vs
// Union Berlin and Monaco vs Lens were both simply absent from the 50
// fixtures returned, which looked like several whole rounds' worth of
// fixtures rather than anything date-filtered). This dumps the RAW,
// unprocessed JSON for one call (bypassing getLeagueFixtures()'s own
// `data.data ?? []` unwrapping) to see: (1) whether the response carries a
// pagination object at all (getLeagueTeams() needed one for the exact same
// undocumented 50-result cap, confirmed live elsewhere in this file), and
// (2) the full raw shape of one fixture entry, since diagnoseGoalApiIdResolution.js's
// `m.date ?? m.utcDate` both came back undefined -- the real field name
// (if there is one) is still unknown.
const BASE_URL = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';

async function rawCall(path, params) {
  const apiKey = process.env.GOAL_API_KEY;
  if (!apiKey) throw new Error('Missing GOAL_API_KEY env var.');
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await res.text();
  if (!res.ok) throw new Error(`GOAL API request failed: ${res.status} ${res.statusText} ${body}`);
  return JSON.parse(body);
}

async function main() {
  const bundesligaLeagueId = 'cmr77dvgm0002rx06rt2uqxii';
  const today = new Date().toISOString().slice(0, 10);

  console.log(`Raw call: /leagues/${bundesligaLeagueId}/fixtures?date=${today}`);
  const data = await rawCall(`/leagues/${bundesligaLeagueId}/fixtures`, { date: today });

  console.log('\nTop-level response keys:', Object.keys(data));
  console.log('pagination field:', JSON.stringify(data.pagination ?? 'NONE'));
  console.log('data.data length:', (data.data ?? []).length);

  const first = data.data?.[0];
  console.log('\nFull raw shape of first fixture entry:');
  console.log(JSON.stringify(first, null, 2));

  const bayernMatch = (data.data ?? []).find(
    (m) => /bayern/i.test(m.homeTeam?.name ?? '') || /bayern/i.test(m.awayTeam?.name ?? '')
  );
  console.log('\nAny Bayern München fixture found in this response:', bayernMatch ? JSON.stringify(bayernMatch, null, 2) : 'NONE FOUND');

  // Try without the date param at all, to see if the endpoint behaves any
  // differently (e.g. still capped at 50, but a DIFFERENT 50, which would
  // point at date filtering being silently ignored either way).
  console.log('\n--- Same call WITHOUT the date param ---');
  const noDate = await rawCall(`/leagues/${bundesligaLeagueId}/fixtures`, {});
  console.log('data.data length (no date):', (noDate.data ?? []).length);
  console.log('pagination field (no date):', JSON.stringify(noDate.pagination ?? 'NONE'));

  // Try common pagination params in case the endpoint silently supports
  // them the same way /leagues/{id}/teams does (limit/offset, confirmed
  // live for that endpoint per getLeagueTeams()'s own comment).
  console.log('\n--- Same call with limit=100&offset=50, no date ---');
  const page2 = await rawCall(`/leagues/${bundesligaLeagueId}/fixtures`, { limit: 100, offset: 50 });
  console.log('data.data length (offset=50):', (page2.data ?? []).length);
  const bayernPage2 = (page2.data ?? []).find(
    (m) => /bayern/i.test(m.homeTeam?.name ?? '') || /bayern/i.test(m.awayTeam?.name ?? '')
  );
  console.log('Bayern München fixture in offset=50 page:', bayernPage2 ? JSON.stringify(bayernPage2, null, 2) : 'NONE FOUND');
}

main().catch((err) => {
  console.error('Diagnose raw GOAL API fixtures failed:', err);
  process.exitCode = 1;
});
