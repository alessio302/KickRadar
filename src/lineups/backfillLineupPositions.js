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

  const { data: allPlayers, error: playersErr } = await supabase.from('players').select('goal_api_id, normalized_name, position');
  if (playersErr) throw playersErr;
  const positionByGoalApiId = new Map(allPlayers.filter((p) => p.goal_api_id).map((p) => [p.goal_api_id, p.position]));
  const positionByNormalizedName = new Map(allPlayers.filter((p) => p.position).map((p) => [p.normalized_name, p.position]));

  const { data: lineups, error: lineupsErr } = await supabase.from('lineups').select('fixture_id, club_id, players');
  if (lineupsErr) throw lineupsErr;

  let checked = 0;
  let updated = 0;
  let failed = 0;
  for (const row of lineups) {
    checked += 1;
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
