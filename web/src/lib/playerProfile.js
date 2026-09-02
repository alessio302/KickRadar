// Shared by every "open a player's profile" entry point (a lineup tap in
// FixtureDetailOverlay.jsx, a squad tap in ClubDetailOverlay.jsx, and a
// "View profile" tap on a transfer card) -- all three now build the
// overlay's content the same way, via the same live call, instead of each
// reading from whatever data happened to be nearby (a lineup/squad
// response's own fields vs. a possibly-stale `players` table snapshot).
// Confirmed live those could show different numbers for the same player at
// the same time; this is the fix.
const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-player-profile`;

export async function fetchPlayerProfile(goalApiId) {
  if (!goalApiId) return null;
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
}
