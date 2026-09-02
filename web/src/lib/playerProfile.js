import { supabase } from './supabaseClient.js';

// Shared by every "open a player's profile" entry point (a lineup tap in
// FixtureDetailOverlay.jsx, a squad tap in ClubDetailOverlay.jsx, and a
// "View profile" tap on a transfer card) -- all three now build the
// overlay's content the same way, via the same source, instead of each
// reading from whatever data happened to be nearby (a lineup/squad
// response's own fields vs. a possibly-stale `players` table snapshot).
// Confirmed live those could show different numbers for the same player at
// the same time; this is the fix.
const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-player-profile`;

// Same columns get-player-profile's own rowToPlayer() returns, read
// directly here instead -- `players` already has the same public-read RLS
// policy every other table this app queries client-side has (see
// sql/004_enable_rls.sql), and syncPlayerProfiles.js keeps it current for
// every tracked squad member every 6h independently of whether anyone's
// looking (see that file's own comment). So the common case -- a player
// already synced -- never needs the Edge Function at all: one fewer hop
// than a fetch() to it (no Deno cold-start risk either), confirmed live
// to shave real time off what was already a fast path. Only a player NOT
// yet in `players` (a brand-new signing, a free agent, someone from a
// non-tracked league) falls through to the Edge Function below, which
// still owns that live GOAL API lookup + write (needs the service-role
// key and GOAL_API_KEY, neither of which belongs in the browser).
const PLAYER_ROW_FIELDS =
  'name, photo_url, birthdate, position, current_club_name, current_club_badge, nationality_name, nationality_badge, squad_number, injured, stats, goal_api_updated_at';

// Module-level, not component state -- survives across every overlay this
// player gets opened from for the rest of the page's lifetime (a full
// reload naturally clears it). Re-opening the same player within the same
// session would otherwise repeat the same round trip for an answer that
// can't have changed since.
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
      const { data: row } = await supabase.from('players').select(PLAYER_ROW_FIELDS).eq('goal_api_id', goalApiId).maybeSingle();
      if (row) return row;

      const res = await fetch(`${FUNCTION_URL}?player_id=${goalApiId}`, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      });
      const data = await res.json();
      return data.profileAvailable ? data.player : null;
    } catch (err) {
      console.error('Failed to load player profile', goalApiId, err);
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
