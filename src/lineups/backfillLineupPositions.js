// Temporary one-off backfill (per this project's usual pattern) -- fixes
// already-stored lineups.players rows whose per-player position still
// carries GOAL API's own per-match lineup tag instead of the now-preferred
// authoritative players.position (see syncLineups.js's resolvePosition,
// added same session). syncLineups.js's own fix only affects lineups
// resolved going forward; an already-confirmed, finished fixture's lineup
// is never re-fetched (lineupNeeded() returns false once both sides are
// confirmed), so the mismatch a user actually reported (Zeno Van Den
// Bosch tagged "Midfielder" in the lineup vs "Defender" on his profile)
// would otherwise never self-heal. One-off script, removed once run.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { fetchAllRows } from '../db/fetchAllRows.js';
import { normalize } from '../util/normalize.js';

function correctedPosition(entry, positionByGoalApiId, positionByNormalizedName) {
  return (entry.id && positionByGoalApiId.get(entry.id)) || (entry.name && positionByNormalizedName.get(normalize(entry.name))) || null;
}

function fixPlayers(players, positionByGoalApiId, positionByNormalizedName) {
  let changed = false;
  const fixEntry = (entry) => {
    const corrected = correctedPosition(entry, positionByGoalApiId, positionByNormalizedName);
    if (corrected && corrected !== entry.position) {
      changed = true;
      return { ...entry, position: corrected };
    }
    return entry;
  };
  const initialLineup = (players.initialLineup ?? []).map((row) => row.map(fixEntry));
  const substitutes = (players.substitutes ?? []).map(fixEntry);
  return { changed, players: { ...players, initialLineup, substitutes } };
}

export async function backfillLineupPositions() {
  const supabase = getSupabaseClient();

  // fetchAllRows(), not a plain .select() -- confirmed live this run
  // (2026-09-12, same class of bug as syncPlayerProfiles.js's own fix on
  // 2026-09-06): players has grown well past PostgREST's default 1000-row
  // response cap, so an unpaginated select here silently missed most of
  // the table. First attempt at this backfill reported updated: 90 but
  // missed the exact two players (Zeno Van Den Bosch, Robert Skov) the
  // user actually reported, since neither happened to be in whatever
  // arbitrary first page came back.
  const allPlayers = await fetchAllRows(supabase, 'players', 'goal_api_id, normalized_name, position');
  const positionByGoalApiId = new Map(allPlayers.filter((p) => p.goal_api_id).map((p) => [p.goal_api_id, p.position]));
  const positionByNormalizedName = new Map(allPlayers.filter((p) => p.position).map((p) => [p.normalized_name, p.position]));

  const lineups = await fetchAllRows(supabase, 'lineups', 'fixture_id, club_id, players');

  let checked = 0;
  let updated = 0;
  let failed = 0;
  for (const row of lineups) {
    checked += 1;
    // European lineups (syncEuropeanLineups.js) store a non-numeric
    // club_id placeholder -- confirmed live (this run) that filtering an
    // update on it throws "invalid input syntax for type integer", a
    // separate pre-existing issue unrelated to this backfill. Nothing to
    // key an update on for those rows, so skip rather than fail on them.
    if (!Number.isFinite(row.club_id)) continue;
    const { changed, players } = fixPlayers(row.players ?? {}, positionByGoalApiId, positionByNormalizedName);
    if (!changed) continue;
    const { error } = await supabase.from('lineups').update({ players }).eq('fixture_id', row.fixture_id).eq('club_id', row.club_id);
    if (error) {
      console.error(`Failed to update lineup for fixture ${row.fixture_id} club ${row.club_id}:`, error.message);
      failed += 1;
    } else {
      updated += 1;
    }
  }

  return { checked, updated, failed };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  backfillLineupPositions()
    .then((result) => console.log('Lineup position backfill complete:', result))
    .catch((err) => {
      console.error('Lineup position backfill failed:', err);
      process.exitCode = 1;
    });
}
