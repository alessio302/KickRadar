// Temporary diagnostic: checking whether football-data.org's free tier
// could replace GOAL API for player profiles (photo, stats, squad
// completeness) -- see this session's GOAL API squad-gap investigation
// (Saka/Ødegaard missing from GOAL API's own /teams/{id}/players for
// Arsenal). Removed once answered.
const BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';
const apiKey = process.env.FOOTBALL_DATA_API_KEY;

async function call(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { 'X-Auth-Token': apiKey } });
  const body = await res.json();
  if (!res.ok) {
    console.log(`  ${path} -> ${res.status} ${res.statusText}`, JSON.stringify(body));
    return null;
  }
  return body;
}

async function main() {
  if (!apiKey) throw new Error('Missing FOOTBALL_DATA_API_KEY');

  console.log('=== Arsenal FC squad (/teams/57) ===');
  const team = await call('/teams/57');
  if (team) {
    console.log(`squad length: ${team.squad?.length ?? 0}`);
    const hasSaka = team.squad?.some((p) => p.name.toLowerCase().includes('saka'));
    const hasOdegaard = team.squad?.some((p) => p.name.toLowerCase().includes('degaard'));
    console.log(`Saka present: ${hasSaka}, Ødegaard present: ${hasOdegaard}`);
    console.log('First squad entry, full raw shape:', JSON.stringify(team.squad?.[0], null, 2));
    console.log('All squad names:', team.squad?.map((p) => p.name).join(', '));
  }

  // Free tier rate limit: 10 req/min -- wait before the next call.
  await new Promise((r) => setTimeout(r, 6500));

  // Try the /persons/{id} endpoint (individual player detail) using
  // whatever id the squad array gave us for its first entry.
  const firstPlayerId = team?.squad?.[0]?.id;
  if (firstPlayerId) {
    console.log(`\n=== /persons/${firstPlayerId} ===`);
    const person = await call(`/persons/${firstPlayerId}`);
    if (person) console.log('Full raw shape:', JSON.stringify(person, null, 2));
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
