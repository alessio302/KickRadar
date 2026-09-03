import { getTeamSquad } from './goalApiClient.js';

// Temporary: check whether GOAL API genuinely has no stats on file for
// Inter's goalkeepers (Martinez, Provedel, Di Gennaro all show stats: {}
// in our own `players` table, while every outfield teammate has real
// numbers, up to matchPlayed: 18 for Acerbi) -- or whether our own
// extraction is dropping fields GOAL API actually returns for them.
async function main() {
  const squad = await getTeamSquad('cmr7fp1wj2n8urx061yv6ov5t'); // Inter Milan
  const keepers = squad.filter((p) => p.type === 'Goalkeepers');
  console.log(`Inter squad size: ${squad.length}, goalkeepers: ${keepers.length}`);
  for (const p of keepers) {
    console.log(`\n=== ${p.name} (id ${p.id}) -- full raw entry ===`);
    console.log(JSON.stringify(p, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
