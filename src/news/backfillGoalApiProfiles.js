import { getSupabaseClient } from '../db/supabaseClient.js';
import { resolveGoalApiProfile } from './playerProfileResolver.js';

// One-time backfill (diagnose->confirm->delete): resolvePlayerProfile()
// used to cache a player's FIRST resolution attempt forever, so any player
// first mentioned during a transient GOAL API outage (e.g. today's
// documented rate-limit saturation) got permanently stuck on the
// transfermarkt.de fallback with no photo/stats, even for clearly
// resolvable real players -- confirmed live from a user screenshot
// showing "Spieler suchen" instead of "Profil ansehen" for Pape Matar
// Sarr, Alexander Sørloth, Alexis Saelemaekers and Franck Kessié.
// playerProfileResolver.js's resolvePlayerProfile() is now fixed to retry
// on every future mention of a goal_api_id-less player, but that only
// heals players who get mentioned again -- this backfill retries every
// existing stuck player once, right now, using the same from/to club
// names their own transfer story already carries for disambiguation.
async function main() {
  const supabase = getSupabaseClient();

  const { data: stuckPlayers, error: playersErr } = await supabase
    .from('players')
    .select('id, name')
    .is('goal_api_id', null);
  if (playersErr) throw playersErr;

  console.log(`${stuckPlayers.length} players with no goal_api_id on file`);

  let healed = 0;
  let stillUnresolved = 0;

  for (const player of stuckPlayers) {
    const { data: transferRows, error: transferErr } = await supabase
      .from('transfers')
      .select('from_club, to_club')
      .eq('player_id', player.id)
      .limit(1);
    if (transferErr) throw transferErr;
    const candidateClubNames = transferRows[0] ? [transferRows[0].from_club, transferRows[0].to_club] : [];

    const profile = await resolveGoalApiProfile(player.name, candidateClubNames);
    if (!profile) {
      stillUnresolved += 1;
      continue;
    }

    const { error: updateErr } = await supabase.from('players').update(profile).eq('id', player.id);
    if (updateErr) throw updateErr;
    healed += 1;
    console.log(`Healed "${player.name}" -> goal_api_id=${profile.goal_api_id}`);
  }

  console.log(`Done: ${healed} healed, ${stillUnresolved} still no confident GOAL API match`);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exitCode = 1;
});
