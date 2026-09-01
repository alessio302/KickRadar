// Temporary diagnostic: does GOAL API's /fixtures/:id/lineups response
// already embed a player photo, or does that need a separate /players/:id
// call per player (like playerProfileResolver.js already does for transfer
// stories)? Resolving a real recent LaLiga fixture (Barcelona-Rayo,
// 2026-08-31) via the same league+date lookup syncLineups.js already does,
// then dumping one raw lineup entry's full key set.
import { getLeagueFixtures, getFixtureLineups } from './goalApiClient.js';

async function main() {
  const laLigaGoalApiId = 'cmr77dvnt006nrx063v3w622e';
  const fixtures = await getLeagueFixtures(laLigaGoalApiId, '2026-08-31');
  console.log('fixtures found:', fixtures.length);
  const match = fixtures.find(
    (f) => /barcelona/i.test(f.homeTeam?.name || '') || /barcelona/i.test(f.homeTeamName || '')
  );
  console.log('matched fixture:', match?.id, match?.homeTeamName, match?.awayTeamName);
  if (!match) return;

  const lineups = await getFixtureLineups(match.id);
  console.log('hasLineups:', lineups?.hasLineups);
  const firstPlayer = lineups?.home?.startingLineups?.[0];
  console.log('first player raw entry:', JSON.stringify(firstPlayer, null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
