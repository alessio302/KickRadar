import { getSupabaseClient } from '../db/supabaseClient.js';
import { refreshGoalApiProfileById } from './playerProfileResolver.js';

// Player profiles were previously a permanent one-time snapshot: once
// resolveGoalApiProfile() succeeded for a player, nothing ever asked GOAL
// API about them again -- confirmed live via a user report that Bradley
// Barcola's stats/club stayed frozen at whatever they were the moment he
// was first resolved, even as the season (and his transfer situation)
// moved on. This is the periodic counterpart: refreshes a small batch of
// already-resolved players (oldest-refreshed-first) each run, so stats and
// club/injury status actually keep moving instead of freezing forever.
//
// Batch size and cadence are deliberately conservative -- this account's
// GOAL API rate limit is already shared by syncLineups.js, syncLiveEvents.js
// and news-scraper.js's own first-time player resolution (see this
// project's own history of rate-limit outages from that contention). One
// call per player here (getPlayer by known id, no search step needed)
// keeps each run cheap, but a large players table still means a full
// refresh cycle takes several days at this pace -- an acceptable tradeoff
// for season stats that don't need real-time freshness, not worth risking
// another rate-limit outage over.
const BATCH_SIZE = 15;

async function main() {
  const supabase = getSupabaseClient();

  const { data: players, error: playersErr } = await supabase
    .from('players')
    .select('id, name, goal_api_id')
    .not('goal_api_id', 'is', null)
    .order('stats_refreshed_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);
  if (playersErr) throw playersErr;

  console.log(`Refreshing ${players.length} players (batch of up to ${BATCH_SIZE})`);

  let refreshed = 0;
  let failed = 0;

  for (const player of players) {
    const profile = await refreshGoalApiProfileById(player.goal_api_id);
    if (!profile) {
      // Deliberately does NOT bump stats_refreshed_at on failure (a 429,
      // or GOAL API genuinely dropping this id) -- leaving it stale means
      // this player naturally sorts to the front of the next run's batch
      // instead of silently being marked "fresh" while still holding old
      // data.
      failed += 1;
      continue;
    }

    const { error: updateErr } = await supabase
      .from('players')
      .update({ ...profile, stats_refreshed_at: new Date().toISOString() })
      .eq('id', player.id);
    if (updateErr) throw updateErr;
    refreshed += 1;
  }

  console.log(`Done: ${refreshed} refreshed, ${failed} failed`);
}

main().catch((err) => {
  console.error('Player profile refresh failed:', err);
  process.exitCode = 1;
});
