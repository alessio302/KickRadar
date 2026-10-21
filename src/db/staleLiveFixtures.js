// A fixture still on 'live' this long after kickoff is over, whatever GOAL API
// says. Confirmed live (2026-10-20): six Champions League fixtures stayed
// 'live' for a day, and the poller kept asking for them every run because the
// live clause had no time bound. Past this point they are closed out here.
const STALE_LIVE_MS = 4 * 60 * 60 * 1000;

// Closes out UEFA fixtures that have been 'live' longer than any real match
// runs. Runs before the attention gate so it still happens on a run that has
// nothing else to poll. Only touches rows already past the window; no GOAL API
// calls are made here.
async function closeStaleLiveFixtures(supabase, uefaLeagueIds) {
  const cutoff = new Date(Date.now() - STALE_LIVE_MS).toISOString();
  const { data, error } = await supabase
    .from('fixtures')
    .update({ status: 'finished', updated_at: new Date().toISOString() })
    .in('league_id', uefaLeagueIds)
    .eq('status', 'live')
    .lt('kickoff_at', cutoff)
    .select('id');
  if (error) {
    console.error('Failed to close stale live European fixtures:', error.message);
    return 0;
  }
  if (data?.length) console.log(`Closed ${data.length} stale live European fixture(s) older than ${STALE_LIVE_MS / 3600000}h`);
  return data?.length ?? 0;
}

export { STALE_LIVE_MS, closeStaleLiveFixtures };
