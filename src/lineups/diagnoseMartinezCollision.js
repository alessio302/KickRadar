import { getTeamSquad, searchPlayers } from './goalApiClient.js';

// Temporary diagnostic (delete after use): live-checks GOAL API's own data
// for the Josep/Lautaro Martinez name-collision bug reported against
// Inter's squad tab. Two independent theories under test:
//  1. GOAL API's club-scoped squad list (getTeamSquad, syncPlayerProfiles.js's
//     free in-memory match) has both players, and their shared surname
//     collides in that file's goalByLastToken map.
//  2. GOAL API's squad list is missing one of them, triggering a gap-fill
//     name search (searchPlayers) whose result playerProfileResolver.js's
//     pickBestMatch() trusts without checking it actually matches the name
//     that was searched for.
const INTER_GOAL_API_ID = 'cmr7fp1wj2n8urx061yv6ov5t';

async function main() {
  console.log('--- getTeamSquad(Inter) entries with surname "martinez" ---');
  const squad = await getTeamSquad(INTER_GOAL_API_ID);
  const martinezEntries = squad.filter((p) => String(p.name).toLowerCase().includes('martinez') || String(p.name).toLowerCase().includes('martínez'));
  console.log(JSON.stringify(martinezEntries, null, 2));

  console.log('\n--- searchPlayers("Josep Martinez") ---');
  const josepResults = await searchPlayers('Josep Martinez');
  console.log(JSON.stringify(josepResults, null, 2));

  console.log('\n--- searchPlayers("Lautaro Martinez") ---');
  const lautaroResults = await searchPlayers('Lautaro Martinez');
  console.log(JSON.stringify(lautaroResults, null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
