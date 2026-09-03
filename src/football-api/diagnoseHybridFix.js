// Temporary: exercises syncPlayerProfiles.js's new hybrid resolution logic
// against just Arsenal (known gap case) before trusting the full ~96-club,
// up-to-90-minute production run to apply it correctly at scale. Removed
// once answered.
import { getTeamSquad } from '../lineups/goalApiClient.js';
import { normalize } from '../util/normalize.js';
import { resolveGoalApiProfile } from '../news/playerProfileResolver.js';

const ARSENAL_GOAL_API_ID = 'cmr7foowe2kf3rx06u6eu3rhl';
const ARSENAL_EXTERNAL_TEAM_ID = 57;
const CLUB_NAME = 'Arsenal FC';

const FOOTBALL_DATA_BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';

async function getFootballDataSquad(externalTeamId) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  const res = await fetch(`${FOOTBALL_DATA_BASE_URL}/teams/${externalTeamId}`, { headers: { 'X-Auth-Token': apiKey } });
  if (!res.ok) throw new Error(`GET /teams/${externalTeamId} failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.squad || [];
}

function lastToken(name) {
  const parts = normalize(name).trim().split(/\s+/);
  return parts[parts.length - 1];
}

async function main() {
  const fdSquad = await getFootballDataSquad(ARSENAL_EXTERNAL_TEAM_ID);
  const goalSquad = await getTeamSquad(ARSENAL_GOAL_API_ID);
  console.log(`football-data.org squad: ${fdSquad.length}, GOAL API squad: ${goalSquad.length}`);

  const goalByLastToken = new Map();
  for (const gp of goalSquad) {
    const key = lastToken(gp.name);
    if (!goalByLastToken.has(key)) goalByLastToken.set(key, gp);
  }

  const watch = ['Saka', 'Odegaard', 'Ødegaard'];
  for (const fp of fdSquad) {
    if (!watch.some((w) => fp.name.includes(w.replace('Ø', 'O')) || fp.name.includes(w))) continue;
    const goalEntry = goalByLastToken.get(lastToken(fp.name)) ?? null;
    console.log(`\n--- ${fp.name} ---`);
    if (goalEntry) {
      console.log(`  in-memory match found: id=${goalEntry.id} photo=${goalEntry.image}`);
    } else {
      console.log('  no in-memory match, falling back to resolveGoalApiProfile()...');
      const resolved = await resolveGoalApiProfile(fp.name, [CLUB_NAME]);
      if (resolved) {
        console.log(`  RESOLVED: goal_api_id=${resolved.goal_api_id} photo_url=${resolved.photo_url} stats.goals=${resolved.stats?.goals} current_club_name(raw)=${resolved.current_club_name}`);
      } else {
        console.log('  UNRESOLVED (no confident match)');
      }
    }
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
