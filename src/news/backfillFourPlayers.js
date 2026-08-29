import { getSupabaseClient } from '../db/supabaseClient.js';
import { resolveGoalApiProfile } from './playerProfileResolver.js';

// Follow-up to the interrupted backfillGoalApiProfiles.js run (hit a
// sustained GOAL API rate-limit wall after only 22 of 416 stuck players --
// see that commit history): targets just the 4 specific players the user's
// screenshot showed stuck on "Spieler suchen" (Pape Matar Sarr, Alexander
// Sørloth, Alexis Saelemaekers, Franck Kessié), so they get fixed now
// rather than waiting for the full 416-player backlog or a future news
// mention to reach them. Read-mostly, only 4 players -- small enough to
// likely clear even with the account's rate limit still recovering.
const TARGET_NAMES = ['Pape Matar Sarr', 'Alexander Sørloth', 'Alexis Saelemaekers', 'Franck Kessié'];

async function main() {
  const supabase = getSupabaseClient();

  for (const name of TARGET_NAMES) {
    const { data: player, error: playerErr } = await supabase
      .from('players')
      .select('id, name, goal_api_id')
      .ilike('name', name)
      .maybeSingle();
    if (playerErr) throw playerErr;
    if (!player) {
      console.log(`"${name}": no players row found`);
      continue;
    }
    if (player.goal_api_id) {
      console.log(`"${name}": already has goal_api_id=${player.goal_api_id}, skipping`);
      continue;
    }

    const { data: transferRows, error: transferErr } = await supabase
      .from('transfers')
      .select('from_club, to_club')
      .eq('player_id', player.id)
      .limit(1);
    if (transferErr) throw transferErr;
    const candidateClubNames = transferRows[0] ? [transferRows[0].from_club, transferRows[0].to_club] : [];

    const profile = await resolveGoalApiProfile(player.name, candidateClubNames);
    if (!profile) {
      console.log(`"${name}": still no confident GOAL API match`);
      continue;
    }

    const { error: updateErr } = await supabase.from('players').update(profile).eq('id', player.id);
    if (updateErr) throw updateErr;
    console.log(`"${name}": healed -> goal_api_id=${profile.goal_api_id}`);
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exitCode = 1;
});
