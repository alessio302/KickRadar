import { getSupabaseClient } from '../db/supabaseClient.js';
import { getTeamSquad } from './goalApiClient.js';

// Temporary diagnostic: does GOAL API's isCaptain field ever actually come
// back true for a real squad, or is it silently always false/absent --
// the Crown icon in ClubDetailOverlay.jsx's SquadTab (and get-team-squad's
// own isCaptain: Boolean(p.isCaptain) mapping) has never been reported as
// visibly showing for any club.
async function main() {
  const supabase = getSupabaseClient();
  const { data: clubs } = await supabase.from('clubs').select('id, name, goal_api_id').not('goal_api_id', 'is', null).limit(15);

  let allCaptains = [];
  let firstPlayer = null;
  for (const club of clubs) {
    const squad = await getTeamSquad(club.goal_api_id);
    if (!firstPlayer && squad.length) firstPlayer = squad[0];
    const captains = squad.filter((p) => p.isCaptain === true || p.isCaptain === 'true' || p.isCaptain === 'Yes');
    if (captains.length) allCaptains.push(...captains.map((c) => `${c.name} (${club.name})`));
    console.log(`${club.name}: ${squad.length} players, captains: ${captains.length}`);
  }
  console.log('All captains found across sampled clubs:', allCaptains);
  console.log('Full raw player object (all fields), first player found:', JSON.stringify(firstPlayer, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
