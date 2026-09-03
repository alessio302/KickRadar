import { getTeamSquad } from '../lineups/goalApiClient.js';

// Temporary diagnostic: syncPlayerProfiles.js's `players` table is
// missing several prominent players (Saka/Ødegaard for Arsenal,
// Calhanoglu for Inter, Malen for Roma) despite running every 6h against
// every tracked club. Checking whether GOAL API's own /teams/{id}/players
// response for these clubs includes them at all right now, to tell apart
// "GOAL API doesn't return them" from "our own sync is dropping them".
// Removed once answered.
const TARGETS = [
  { club: 'Arsenal FC', goalApiId: 'cmr7foowe2kf3rx06u6eu3rhl', watch: ['saka', 'degaard', 'odegaard'] },
  { club: 'FC Internazionale Milano', goalApiId: 'cmr7fp1wj2n8urx061yv6ov5t', watch: ['calhanoglu'] },
  { club: 'AS Roma', goalApiId: 'cmr7m6brt5t37rx06ixsgl3rc', watch: ['malen'] },
];

async function main() {
  for (const target of TARGETS) {
    const squad = await getTeamSquad(target.goalApiId);
    console.log(`\n=== ${target.club} (${squad.length} players returned) ===`);
    for (const watchTerm of target.watch) {
      const hits = squad.filter((p) => p.name.toLowerCase().includes(watchTerm));
      if (hits.length === 0) {
        console.log(`  "${watchTerm}": NOT in raw GOAL API response`);
      } else {
        for (const h of hits) {
          console.log(`  "${watchTerm}": FOUND -- id=${h.id} name="${h.name}" type=${h.type} goals=${h.goals} assists=${h.assists} matchPlayed=${h.matchPlayed}`);
        }
      }
    }
    // Dump every name so we can see if the whole squad is short/odd
    console.log(`  Full squad names: ${squad.map((p) => p.name).join(', ')}`);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
