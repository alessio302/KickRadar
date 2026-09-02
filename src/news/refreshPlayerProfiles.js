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
// syncPlayerProfiles.js now walks every tracked club's full current squad
// every 6h (built later than this file), which covers that same freshness
// need for anyone actually on one of those 96 rosters -- for those players
// this file used to just re-fetch what the squad walk had already just
// written, spending GOAL API request budget for nothing new. Scoped here
// to players whose current_club_name isn't one of our own tracked clubs'
// names (a free agent, or -- the actual remaining reason this file still
// exists -- a transfer-rumor target at a club outside our 5 leagues, which
// news-scraper.js resolves once via playerProfileResolver.js but the squad
// walk never touches again). current_club_name is written verbatim from
// clubs.name by both the squad-walk (syncPlayerProfiles.js) and the
// single-player live-fallback path (playerProfileResolver.js's own
// extractClubAndNationality()), so an exact-name match against our own
// clubs table reliably tells the two groups apart without needing
// clubMatch.js's fuzzy alias matching here.
//
// Batch size and cadence are deliberately conservative -- this account's
// GOAL API rate limit is already shared by syncLineups.js, syncLiveEvents.js,
// syncPlayerProfiles.js and news-scraper.js's own first-time player
// resolution (see this project's own history of rate-limit outages from
// that contention). One call per player here (getPlayer by known id, no
// search step needed) keeps each run cheap, but a large players table
// still means a full refresh cycle takes a while at this pace -- an
// acceptable tradeoff for season stats that don't need real-time
// freshness, not worth risking another rate-limit outage over.
const BATCH_SIZE = 15;

// Oversamples the oldest-refreshed candidates before filtering out
// squad-walk-covered players client-side, rather than trying to express
// "current_club_name not in (our club names)" as a PostgREST filter --
// club names can carry characters (quotes, commas) that would need
// careful escaping in a query string for no real benefit over filtering
// an already-small batch in JS.
const CANDIDATE_POOL_SIZE = BATCH_SIZE * 8;

async function main() {
  const supabase = getSupabaseClient();

  const { data: trackedClubs, error: clubsErr } = await supabase.from('clubs').select('name').not('goal_api_id', 'is', null);
  if (clubsErr) throw clubsErr;
  const trackedClubNames = new Set(trackedClubs.map((c) => c.name));

  const { data: candidates, error: playersErr } = await supabase
    .from('players')
    .select('id, name, goal_api_id, current_club_name')
    .not('goal_api_id', 'is', null)
    .order('stats_refreshed_at', { ascending: true, nullsFirst: true })
    .limit(CANDIDATE_POOL_SIZE);
  if (playersErr) throw playersErr;

  const players = candidates.filter((p) => !p.current_club_name || !trackedClubNames.has(p.current_club_name)).slice(0, BATCH_SIZE);

  console.log(`Refreshing ${players.length} players outside tracked-club squads (batch of up to ${BATCH_SIZE})`);

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
