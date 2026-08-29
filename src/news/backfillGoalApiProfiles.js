import { getSupabaseClient } from '../db/supabaseClient.js';
import { resolveGoalApiProfile } from './playerProfileResolver.js';

// One-time backfill (diagnose->confirm->delete), re-run now that the
// account's daily GOAL API quota has reset -- the first attempt (see git
// history) only healed 22 of 416 stuck players before hitting a sustained
// 429 wall that turned out to be the DAILY quota itself being exhausted
// (confirmed via the account's own dashboard showing 1000/1000 used at the
// time), not just the 15-min sliding window. With a fresh daily budget and
// minimal concurrent traffic (late night, few/no live matches for
// syncLineups.js/syncLiveEvents.js to poll), this run should get much
// further per attempt than the first one did.
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
