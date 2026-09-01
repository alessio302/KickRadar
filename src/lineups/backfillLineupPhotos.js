// One-off backfill: syncLineups.js only ever fetches a lineup once (skips
// any fixture whose lineups are already confirmed for both sides -- see
// its own lineupNeeded() comment), so existing confirmed rows never picked
// up the new `photo` field added to normalizePlayer() just now. Re-fetches
// GOAL API's lineups for every already-confirmed lineup from the last 7
// days and overwrites `players` in place, so recent/current-matchday
// lineups show real photos immediately instead of only from the next
// fixture onward. Run once, then delete (same pattern as this project's
// other one-off backfills).
import { getSupabaseClient } from './../db/supabaseClient.js';
import { getFixtureLineups } from './goalApiClient.js';
import { resolveGoalApiIds } from './syncLiveEvents.js';

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

const POSITION_SINGULAR = {
  Goalkeepers: 'Goalkeeper',
  Defenders: 'Defender',
  Midfielders: 'Midfielder',
  Forwards: 'Forward',
};
const ROW_ORDER = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];

function normalizePlayer(entry) {
  return {
    id: entry.playerId,
    name: entry.lineupPlayer,
    number: entry.lineupNumber ? Number(entry.lineupNumber) : null,
    position: POSITION_SINGULAR[entry.playerPosition] || entry.playerPosition || null,
    photo: entry.playerImage || null,
  };
}

function groupByPositionRows(entries) {
  const players = (entries ?? []).map(normalizePlayer);
  return ROW_ORDER.map((pos) => players.filter((p) => p.position === pos)).filter((row) => row.length > 0);
}

function buildLineupTeam(section, formation) {
  if (!section) return null;
  return {
    formation,
    initialLineup: groupByPositionRows(section.startingLineups),
    substitutes: (section.substitutes ?? []).map(normalizePlayer),
  };
}

async function main() {
  const supabase = getSupabaseClient();
  const cutoff = new Date(Date.now() - LOOKBACK_MS).toISOString();

  const { data: rows, error } = await supabase
    .from('lineups')
    .select('fixture_id, club_id, confirmed, fixtures!inner(id, league_id, home_club_id, away_club_id, kickoff_at)')
    .eq('confirmed', true)
    .gte('fixtures.kickoff_at', cutoff);
  if (error) throw error;

  const fixturesById = new Map();
  for (const r of rows) fixturesById.set(r.fixture_id, r.fixtures);
  const candidates = [...fixturesById.values()];
  console.log(`Re-fetching lineups for ${candidates.length} already-confirmed fixtures...`);

  const resolved = await resolveGoalApiIds(supabase, candidates);

  let updated = 0;
  for (const fixture of candidates) {
    const info = resolved.get(fixture.id);
    if (!info) {
      console.warn(`Could not resolve GOAL API id for fixture ${fixture.id}`);
      continue;
    }
    let lineups;
    try {
      lineups = await getFixtureLineups(info.goalApiId);
    } catch (err) {
      console.error(`Lineups fetch failed for fixture ${fixture.id}:`, err.message);
      continue;
    }
    if (!lineups?.hasLineups) continue;

    const homeTeam = buildLineupTeam(lineups.home, lineups.homeFormation);
    const awayTeam = buildLineupTeam(lineups.away, lineups.awayFormation);
    for (const { club, team } of [
      { club: info.homeClubId, team: homeTeam },
      { club: info.awayClubId, team: awayTeam },
    ]) {
      if (!team) continue;
      const { error: updateErr } = await supabase
        .from('lineups')
        .update({ players: { initialLineup: team.initialLineup, substitutes: team.substitutes }, formation: team.formation })
        .eq('fixture_id', fixture.id)
        .eq('club_id', club);
      if (updateErr) console.error(`Update failed for fixture ${fixture.id} club ${club}:`, updateErr.message);
      else updated += 1;
    }
  }
  console.log(`Backfill complete: ${updated} lineup rows updated.`);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exitCode = 1;
});
