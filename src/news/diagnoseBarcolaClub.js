import { getSupabaseClient } from '../db/supabaseClient.js';
import { getPlayer } from '../lineups/goalApiClient.js';

// Throwaway diagnostic: user screenshot shows Barcola's profile overlay
// with no club row at all (only nationality "France"), even though the
// backfill just successfully resolved his goal_api_id. Checking (1) what
// extractClubAndNationality() actually stored for him, and (2) GOAL API's
// raw getPlayer() response right now, to see whether `team` is genuinely
// null/absent on their side or something is mis-parsed on ours.
// Read-only, no writes.
async function main() {
  const supabase = getSupabaseClient();

  const { data: player, error } = await supabase
    .from('players')
    .select('id, name, goal_api_id, current_club_name, current_club_badge, nationality_name, nationality_badge')
    .ilike('name', 'Bradley Barcola')
    .maybeSingle();
  if (error) throw error;

  console.log('Stored players row:', JSON.stringify(player, null, 2));

  if (player?.goal_api_id) {
    const profile = await getPlayer(player.goal_api_id);
    console.log('Raw GOAL API getPlayer() response:', JSON.stringify(profile, null, 2));
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
