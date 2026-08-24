// One-off diagnostic, not part of the regular pipeline. Cross-checks the
// `clubs` table (populated by syncClubs.js, which upserts but never
// deletes) against clubs that actually appear in synced `fixtures` -- the
// real, current-season signal for "who's actually in Serie A right now".
// A club with zero fixtures is either a stale leftover from a season it
// got relegated out of (upsert never removes rows the source stops
// returning), or just not synced into any fixture window yet.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();

  const { data: league, error: leagueErr } = await supabase
    .from('leagues')
    .select('id')
    .eq('slug', 'serie-a')
    .single();
  if (leagueErr) throw leagueErr;

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, name')
    .eq('league_id', league.id);
  if (clubsErr) throw clubsErr;

  const { data: fixtures, error: fixturesErr } = await supabase
    .from('fixtures')
    .select('matchday, home_club_id, away_club_id, kickoff_at')
    .eq('league_id', league.id);
  if (fixturesErr) throw fixturesErr;

  console.log(`Serie A: ${clubs.length} clubs in DB, ${fixtures.length} fixtures synced.`);

  const matchdays = [...new Set(fixtures.map((f) => f.matchday))].sort((a, b) => a - b);
  console.log('Matchdays present:', matchdays);

  const clubIdsInFixtures = new Set();
  for (const f of fixtures) {
    clubIdsInFixtures.add(f.home_club_id);
    clubIdsInFixtures.add(f.away_club_id);
  }

  const withFixtures = clubs.filter((c) => clubIdsInFixtures.has(c.id));
  const withoutFixtures = clubs.filter((c) => !clubIdsInFixtures.has(c.id));

  console.log(`\nClubs WITH at least one synced fixture (${withFixtures.length}):`);
  console.log(withFixtures.map((c) => c.name));

  console.log(`\nClubs WITHOUT any synced fixture (${withoutFixtures.length}) -- possibly stale:`);
  console.log(withoutFixtures.map((c) => c.name));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
