// True while a match is live or kicks off close to now, across every tracked
// league. Player-profile syncs check this and stand down: they draw from the
// same GOAL API daily budget as the live pollers, and on a match day that
// budget is what keeps live coverage going. Fails closed (returns true) when
// the query errors -- skipping a player sync is cheap, an unbudgeted one is not.
const WINDOW_BEFORE_MS = 4 * 60 * 60 * 1000;
const WINDOW_AFTER_MS = 60 * 60 * 1000;

export async function isMatchWindowOpen(supabase) {
  const now = Date.now();
  const from = new Date(now - WINDOW_BEFORE_MS).toISOString();
  const to = new Date(now + WINDOW_AFTER_MS).toISOString();
  const { count, error } = await supabase
    .from('fixtures')
    .select('id', { count: 'exact', head: true })
    .or(`status.eq.live,and(kickoff_at.gte.${from},kickoff_at.lte.${to})`);
  if (error) {
    console.error('Match window check failed, treating as open:', error.message);
    return true;
  }
  return (count ?? 0) > 0;
}
