import { getSupabaseClient } from '../db/supabaseClient.js';
import { refreshGoalApiProfileById } from './playerProfileResolver.js';

// One-off backfill: goal_api_updated_at (032_goal_api_updated_at.sql) is a
// new column, so every already-resolved player has it null until
// refreshPlayerProfiles.js's periodic sweep (batch of 15, every 6h) cycles
// back around to them -- at 83 currently-resolved players, that's over a
// day before the fix in PlayerProfileOverlay.jsx (which hides the "Stand"
// line entirely when this is null) shows a date for everyone again.
// Running this once brings every existing player current immediately;
// refreshPlayerProfiles.js keeps them that way going forward. Same
// throttleGoalApi() spacing as that job (via refreshGoalApiProfileById),
// so no separate rate-limit handling needed here.
async function main() {
  const supabase = getSupabaseClient();

  const { data: players, error: playersErr } = await supabase
    .from('players')
    .select('id, name, goal_api_id')
    .not('goal_api_id', 'is', null);
  if (playersErr) throw playersErr;

  console.log(`Backfilling goal_api_updated_at for ${players.length} players`);

  let updated = 0;
  let failed = 0;

  for (const player of players) {
    const profile = await refreshGoalApiProfileById(player.goal_api_id);
    if (!profile) {
      failed += 1;
      continue;
    }
    const { error: updateErr } = await supabase
      .from('players')
      .update({ ...profile, stats_refreshed_at: new Date().toISOString() })
      .eq('id', player.id);
    if (updateErr) throw updateErr;
    updated += 1;
  }

  console.log(`Done: ${updated} updated, ${failed} failed`);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exitCode = 1;
});
