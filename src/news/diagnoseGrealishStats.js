import { getPlayer } from '../lineups/goalApiClient.js';

// Temporary diagnostic: buildProfileFields()/STAT_FIELDS in
// playerProfileResolver.js only stores a curated subset of GOAL API's raw
// player-profile response. Grealish's stored stats (matchPlayed: 20) can't
// possibly reflect the 2026/27 season a few weeks in -- dumping the FULL raw
// response to see whether GOAL API states a season/period anywhere outside
// the fields we currently keep.
const GREALISH_GOAL_API_ID = 'cmr7hvgh24033rx06w2bifni6';

async function main() {
  const profile = await getPlayer(GREALISH_GOAL_API_ID);
  console.log(JSON.stringify(profile, null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
