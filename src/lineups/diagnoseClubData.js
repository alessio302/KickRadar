// Temporary diagnostic: does GOAL API expose a team/club-level endpoint
// (squad list, upcoming fixtures) beyond what's already used (fixtures,
// lineups, player search/profile)? Testing plausible endpoint shapes
// against a real known team id (Milan, cmr7fp1wj2n8trx061joikfn8, seen
// embedded in an earlier fixtures response's homeTeam field) since no
// dedicated team/club endpoint has been used in this codebase so far.
const BASE_URL = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';
const apiKey = process.env.GOAL_API_KEY;
const TEAM_ID = 'cmr7fp1wj2n8trx061joikfn8'; // Milan

const CANDIDATES = [
  `/teams/${TEAM_ID}`,
  `/teams/${TEAM_ID}/players`,
  `/teams/${TEAM_ID}/squad`,
  `/teams/${TEAM_ID}/fixtures`,
  `/team/${TEAM_ID}`,
  `/clubs/${TEAM_ID}`,
];

async function tryEndpoint(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await res.text();
  console.log(`\n=== ${path} ===`);
  console.log('status:', res.status);
  if (res.ok) {
    try {
      const parsed = JSON.parse(body);
      console.log('top-level keys:', Object.keys(parsed));
      const data = parsed.data;
      if (Array.isArray(data)) {
        console.log('data is array, length:', data.length);
        console.log('first item:', JSON.stringify(data[0], null, 2).slice(0, 800));
      } else if (data && typeof data === 'object') {
        console.log('data keys:', Object.keys(data));
        console.log('data sample:', JSON.stringify(data, null, 2).slice(0, 800));
      }
    } catch {
      console.log('body (non-JSON, truncated):', body.slice(0, 300));
    }
  } else {
    console.log('body:', body.slice(0, 300));
  }
}

async function main() {
  for (const path of CANDIDATES) {
    await tryEndpoint(path);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
