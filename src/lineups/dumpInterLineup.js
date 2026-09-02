import { getSupabaseClient } from '../db/supabaseClient.js';
import { getFixtureLineups } from './goalApiClient.js';
import { resolveGoalApiIds } from './syncLiveEvents.js';

// Temporary: verify the "chunk lineupPosition by the formation string's own
// digits" grouping algorithm against a broad sample of already-synced
// formation shapes (back-five, diamond midfields, lopsided attacking lines,
// etc.), not just the one 3-5-2 / 4-2-3-1 fixture checked so far.
const FIXTURE_IDS = [106, 363, 39, 1554, 323, 2523, 2525, 1540, 1553, 2524];

function chunkFormation(formation, entries) {
  const sorted = entries
    .slice()
    .sort((a, b) => Number(a.lineupPosition) - Number(b.lineupPosition));
  const gk = sorted.find((p) => p.playerPosition === 'Goalkeepers') ?? sorted[0];
  const outfield = sorted.filter((p) => p !== gk);
  const rowSizes = formation.split('-').map(Number);
  const expectedOutfield = rowSizes.reduce((a, b) => a + b, 0);

  const rows = [];
  let idx = 0;
  for (const size of rowSizes) {
    rows.push(outfield.slice(idx, idx + size));
    idx += size;
  }
  const leftover = outfield.slice(idx);

  return {
    gkAtSeq1: sorted[0] === gk,
    outfieldCount: outfield.length,
    expectedOutfield,
    countsMatch: outfield.length === expectedOutfield,
    leftoverCount: leftover.length,
    rows: rows.map((row, i) => ({
      rowSize: rowSizes[i],
      players: row.map((p) => `${p.lineupPlayer} (${p.playerPosition})`),
    })),
  };
}

async function main() {
  const supabase = getSupabaseClient();
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at, status')
    .in('id', FIXTURE_IDS);

  const resolved = await resolveGoalApiIds(supabase, fixtures);

  for (const fixtureId of FIXTURE_IDS) {
    const info = resolved.get(fixtureId);
    if (!info) {
      console.log(`\n=== fixture ${fixtureId}: could not resolve goalApiId, skipping ===`);
      continue;
    }

    let lineups;
    try {
      lineups = await getFixtureLineups(info.goalApiId);
    } catch (err) {
      console.log(`\n=== fixture ${fixtureId}: lineup fetch failed (${err.message}) ===`);
      continue;
    }

    console.log(
      `\n=== fixture ${fixtureId} — home: ${lineups.homeFormation}, away: ${lineups.awayFormation} ===`
    );

    for (const side of ['home', 'away']) {
      const formation = side === 'home' ? lineups.homeFormation : lineups.awayFormation;
      const entries = lineups[side]?.startingLineups ?? [];
      if (!formation || entries.length === 0) {
        console.log(`  [${side}] no formation/lineup data, skipping`);
        continue;
      }
      const result = chunkFormation(formation, entries);
      console.log(`  [${side}] formation=${formation}`, JSON.stringify(result, null, 2));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
