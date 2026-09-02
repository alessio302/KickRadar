import { getSupabaseClient } from '../db/supabaseClient.js';
import { getFixtureLineups } from './goalApiClient.js';
import { resolveGoalApiIds } from './syncLiveEvents.js';

// Temporary diagnostic: syncLineups.js's normalizePlayer() only reads
// entry.playerPosition (the broad GK/DF/MF/FW category already used to
// bucket rows) -- but getFixtureLineups()'s own raw shape comment also
// mentions a separate entry.lineupPosition field that's never been looked
// at. Checking whether that (or anything else in the raw entry) carries
// an exact tactical slot/grid position that could support a real
// formation-shaped layout instead of the current 4 broad-category rows.
async function main() {
  const supabase = getSupabaseClient();

  const { data: lineupRows } = await supabase
    .from('lineups')
    .select('fixture_id, formation')
    .not('formation', 'is', null)
    .order('published_at', { ascending: false })
    .limit(3);
  console.log('Recent lineup rows (fixture_id, formation):', lineupRows);
  if (!lineupRows?.length) return;

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at, status')
    .in('id', lineupRows.map((r) => r.fixture_id));

  const resolved = await resolveGoalApiIds(supabase, fixtures);
  console.log('Resolved GOAL API ids:', [...resolved.entries()]);

  for (const [fixtureId, info] of resolved) {
    const lineups = await getFixtureLineups(info.goalApiId);
    if (!lineups?.hasLineups) continue;
    console.log(`\n=== Fixture ${fixtureId} (${info.goalApiId}) -- formation ${lineups.homeFormation} vs ${lineups.awayFormation} ===`);
    console.log('Sample starting lineup entries (home), all fields:');
    console.log(JSON.stringify((lineups.home?.startingLineups ?? []).slice(0, 5), null, 2));
    break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
