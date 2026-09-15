// Live match statistics (shots, possession, corners, fouls, cards, ...) for
// a UEFA fixture, via the get-fixture-statistics Edge Function -- GOAL API
// is the only one of this app's two providers that has this data at all
// (confirmed live, see that function's own top comment), and it needs the
// GOAL_API_KEY/service-role key, neither of which belongs in the browser.
//
// No module-level cache like fetchPlayerProfile()'s -- that one caches
// because a player's profile barely changes within a session; a live
// match's statistics change throughout the match, so caching here would
// just mean serving stale numbers on a re-open. Each open of the tab gets
// a fresh read.
const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-fixture-statistics`;

export async function fetchFixtureStatistics(goalApiId) {
  if (!goalApiId) return null;
  try {
    const res = await fetch(`${FUNCTION_URL}?goal_api_id=${goalApiId}`, {
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    });
    const data = await res.json();
    return data.available ? data : null;
  } catch (err) {
    console.error('Failed to load fixture statistics', goalApiId, err);
    return null;
  }
}
