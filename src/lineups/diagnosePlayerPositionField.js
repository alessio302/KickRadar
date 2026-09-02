import { getPlayer } from './goalApiClient.js';

// Temporary diagnostic: every endpoint checked so far (squad list,
// lineup entries) only ever exposed a broad `type`/`playerPosition`
// category (Goalkeepers/Defenders/Midfielders/Forwards) -- never a
// specific role like ST/CB/RB/CDM. The one endpoint whose full raw shape
// was never dumped is GOAL API's single-player profile (/players/:id),
// already used by playerProfileResolver.js/get-player-profile but only
// for the fields those already read. Checking whether it carries a more
// specific position field for real, well-known players (a striker and a
// centre-back) that's been sitting unused.
const SAMPLE_IDS = [
  { name: 'Serhou Guirassy (should be ST)', id: 'cmr79jdin057orx06unw4aze6' },
  { name: 'Alessandro Bastoni (should be IV/CB)', id: 'cmr7foobn2k6prx066a92wtwx' },
];

async function main() {
  for (const { name, id } of SAMPLE_IDS) {
    const profile = await getPlayer(id);
    console.log(`\n=== ${name} ===`);
    console.log('All keys:', Object.keys(profile ?? {}));
    console.log(JSON.stringify(profile, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
