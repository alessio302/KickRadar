// Shared by every "open a player's profile" entry point (a lineup tap in
// FixtureDetailOverlay.jsx, a squad tap in ClubDetailOverlay.jsx, and a
// "View profile" tap on a transfer card) -- all three now build the
// overlay's content the same way, via the same live call, instead of each
// reading from whatever data happened to be nearby (a lineup/squad
// response's own fields vs. a possibly-stale `players` table snapshot).
// Confirmed live those could show different numbers for the same player at
// the same time; this is the fix.
const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-player-profile`;

// Module-level, not component state -- survives across every overlay this
// player gets opened from for the rest of the page's lifetime (a full
// reload naturally clears it). Server-side freshness/invalidation already
// lives in get-player-profile itself (TTL + match-aware, see that
// function's own comment), so re-fetching this player again within the
// same session would just get back the exact same server-cached answer at
// the cost of a network round trip -- confirmed live that round trip is
// where the felt 1-2s delay on a re-open came from, not the overlay
// itself (which already shows a minimal placeholder from local data
// immediately, before this ever resolves).
//
// Stores either the resolved player object or the in-flight Promise --
// `await`ing a plain value is a no-op, so a single code path below serves
// both a completed lookup and a still-loading one (e.g. a double-tap on
// the same player) without a second request.
const cache = new Map();

export async function fetchPlayerProfile(goalApiId) {
  if (!goalApiId) return null;
  const cached = cache.get(goalApiId);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const res = await fetch(`${FUNCTION_URL}?player_id=${goalApiId}`, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      });
      const data = await res.json();
      return data.profileAvailable ? data.player : null;
    } catch (err) {
      console.error('Failed to load live player profile', goalApiId, err);
      return null;
    }
  })();

  cache.set(goalApiId, promise);
  const player = await promise;
  // A failed/unavailable lookup isn't cached -- a later tap should get a
  // fresh chance rather than being stuck with "no profile" for the rest
  // of the session over what might have been a transient network blip.
  if (player) cache.set(goalApiId, player);
  else cache.delete(goalApiId);
  return player;
}
