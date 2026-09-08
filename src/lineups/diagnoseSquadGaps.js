// Temporary diagnostic (per this project's usual pattern) -- user pushed
// back on the "international break" theory for the ~44% missing-photo
// rate found in syncPlayerProfiles.js's most recent run (checked: 2636,
// gapFilled: 0, gapUnresolved: 1165), correctly pointing out today is a
// Champions League matchday, not an international window. This checks
// GOAL API's actual live responses for Bayern Munich (club id 25,
// goal_api_id cmr79jab703zerx06eqilba4s) to see what's really going on,
// rather than continuing to guess from an old code comment describing a
// different, past incident.
import { getTeamSquad, searchPlayers } from './goalApiClient.js';

const BAYERN_GOAL_API_ID = 'cmr79jab703zerx06eqilba4s';
const MISSING_NAMES = ['Konrad Laimer', 'Josip Stanišić', 'Michael Olise'];

async function main() {
  console.log('--- getTeamSquad(Bayern) ---');
  const squad = await getTeamSquad(BAYERN_GOAL_API_ID);
  console.log('squad length:', squad.length);
  console.log('squad names:', squad.map((p) => p.name).sort());

  for (const name of MISSING_NAMES) {
    console.log(`\n--- searchPlayers("${name}") ---`);
    const results = await searchPlayers(name);
    console.log('result count:', results.length);
    console.log(JSON.stringify(results.map((r) => ({ id: r.id, name: r.name, team: r.team })), null, 2));
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
