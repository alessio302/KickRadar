import { getSupabaseClient } from '../db/supabaseClient.js';
import { getTeamSquad } from './goalApiClient.js';
import { normalize } from '../util/normalize.js';
import { POSITION_SINGULAR, STAT_FIELDS, extractStats } from '../news/playerProfileResolver.js';

// Proactively keeps every tracked club's current squad's profile data
// (photo, birthdate, position, stats, injury status) fresh in `players`,
// instead of the request path (get-player-profile) doing a live GOAL API
// call the first time -- or the first time after a match -- anyone taps a
// given player. Runs every 6h (see the workflow), one GOAL API call per
// club (~96 total), so every tracked squad member's stats are never more
// than a few hours stale regardless of whether or when anyone actually
// looks. This replaces the read-path TTL + match-aware invalidation
// get-player-profile used to do itself: that approach could only ever be
// as fast as its worst case (a live GOAL API round trip on first tap, or
// right after a match), while this one means the answer is usually
// already sitting in Postgres before anyone asks.
//
// buildFieldsFromSquadEntry() can't just reuse
// playerProfileResolver.js's own buildProfileFields() -- confirmed live a
// squad-endpoint entry and a single-player-endpoint profile don't share a
// raw shape (this one has a flat `country` string and a `teamId`, not the
// other's nested `team` object with its national-team-fallback
// ambiguity) -- but the stat field list and position vocabulary genuinely
// are identical between the two, so those stay imported from that file
// rather than a second copy that could quietly drift from it. The club's
// own name/badge are used directly for current_club_name/badge here
// (we're iterating its squad, so there's no ambiguity to resolve the way
// buildProfileFields() needs its national-team fallback for).
function buildFieldsFromSquadEntry(p, club) {
  return {
    photo_url: p.image || null,
    birthdate: p.birthdate || null,
    position: POSITION_SINGULAR[p.type] || p.type || null,
    squad_number: p.number || null,
    injured: p.injured === 'Yes',
    goal_api_updated_at: p.updatedAt || null,
    current_club_name: club.name,
    current_club_badge: club.crest_url || null,
    nationality_name: p.country || null,
    nationality_badge: null,
    stats: extractStats(p),
  };
}

export async function syncPlayerProfiles() {
  const supabase = getSupabaseClient();

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, name, crest_url, goal_api_id')
    .not('goal_api_id', 'is', null);
  if (clubsErr) throw clubsErr;

  // Loaded once up front rather than per player -- a player can already
  // have a row from playerProfileResolver.js's transfer-story resolution
  // (keyed by whatever name spelling that headline used, e.g. "Rowe" vs.
  // "Jonathan Rowe"), so this still needs the same by-goal_api_id-then-
  // by-normalized_name match that function's own resolvePlayerProfile()
  // does -- just resolved from an in-memory Map instead of two SELECTs
  // per player, since this walks the entire squad list (~2000 players)
  // every run rather than one name at a time.
  const { data: existingRows, error: existingErr } = await supabase.from('players').select('id, goal_api_id, normalized_name');
  if (existingErr) throw existingErr;
  const byGoalApiId = new Map(existingRows.filter((r) => r.goal_api_id).map((r) => [r.goal_api_id, r.id]));
  const byNormalizedName = new Map(existingRows.map((r) => [r.normalized_name, r.id]));

  let checked = 0;
  let updated = 0;
  let inserted = 0;
  let failed = 0;

  for (const club of clubs) {
    let squad;
    try {
      squad = await getTeamSquad(club.goal_api_id);
    } catch (err) {
      console.error(`Squad fetch failed for ${club.name}:`, err.message);
      failed += 1;
      continue;
    }

    for (const p of squad) {
      checked += 1;
      try {
        const fields = buildFieldsFromSquadEntry(p, club);
        const normalizedName = normalize(p.name);
        const targetId = byGoalApiId.get(p.id) ?? byNormalizedName.get(normalizedName) ?? null;
        const row = { goal_api_id: p.id, stats_refreshed_at: new Date().toISOString(), ...fields };

        if (targetId) {
          const { error } = await supabase.from('players').update(row).eq('id', targetId);
          if (error) throw error;
          updated += 1;
        } else {
          const { data: insertedRow, error } = await supabase
            .from('players')
            .insert({ name: p.name, normalized_name: normalizedName, resolved_at: new Date().toISOString(), ...row })
            .select('id')
            .single();
          if (error) throw error;
          inserted += 1;
          byGoalApiId.set(p.id, insertedRow.id);
          byNormalizedName.set(normalizedName, insertedRow.id);
        }
      } catch (err) {
        console.error(`Player sync failed for ${p.name} (${club.name}):`, err.message);
        failed += 1;
      }
    }
  }

  return { checked, updated, inserted, failed };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncPlayerProfiles()
    .then((result) => {
      console.log('Player profiles sync complete:', result);
    })
    .catch((err) => {
      console.error('Player profiles sync failed:', err);
      process.exitCode = 1;
    });
}
