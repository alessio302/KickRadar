import { getTeamSquad } from './goalApiClient.js';

// Temporary diagnostic: does GOAL API's /teams/:id/players response already
// carry per-player season stats (goals, assists, minutes...), or only the
// minimal fields get-team-squad currently maps (id/name/image/number/type/
// age/injured/isCaptain)? Deciding whether every squad member can show
// stats, or only players already resolved into our own `players` table via
// a transfer story.
async function main() {
  const players = await getTeamSquad('cmr7fp1wj2n8trx061joikfn8'); // AC Milan
  console.log(`Total players: ${players.length}`);
  const sample = players.find((p) => p.name === 'Rafael Leao') || players[0];
  console.log('Sample player keys:', Object.keys(sample));
  console.log('Sample player full JSON:', JSON.stringify(sample, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
