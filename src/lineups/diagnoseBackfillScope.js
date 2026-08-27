import { getSupabaseClient } from '../db/supabaseClient.js';

// Read-only: how many already-finished fixtures (within the app's own
// 15-day display window) have no confirmed lineup for at least one side?
// Need this before writing a lineups backfill -- Highlightly's free tier
// is 100 req/day shared with the regular lineups-sync job, so a backfill
// covering "the whole season so far" could blow the daily budget in one
// run if the count is large. getMatches() is grouped by (country, date)
// in syncLineups.js already, so the real cost is roughly
// (distinct country+date pairs) + (fixtures actually needing a lineup
// fetch), not one request per fixture.
const PAST_WINDOW_DAYS = 15;

async function run() {
  const supabase = getSupabaseClient();
  const cutoff = new Date(Date.now() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: fixtures, error } = await supabase
    .from('fixtures')
    .select('id, league_id, kickoff_at, status')
    .eq('status', 'finished')
    .gte('kickoff_at', cutoff);
  if (error) throw error;
  console.log(`finished fixtures within the last ${PAST_WINDOW_DAYS} days: ${fixtures.length}`);

  const { data: lineupRows, error: lineupErr } = await supabase
    .from('lineups')
    .select('fixture_id, club_id, confirmed')
    .in('fixture_id', fixtures.map((f) => f.id));
  if (lineupErr) throw lineupErr;

  const { data: fixtureRows, error: fxErr } = await supabase
    .from('fixtures')
    .select('id, home_club_id, away_club_id')
    .in('id', fixtures.map((f) => f.id));
  if (fxErr) throw fxErr;
  const clubsByFixture = new Map(fixtureRows.map((f) => [f.id, f]));

  const confirmedSet = new Set(lineupRows.filter((r) => r.confirmed).map((r) => `${r.fixture_id}:${r.club_id}`));
  const missing = fixtures.filter((f) => {
    const fx = clubsByFixture.get(f.id);
    if (!fx) return true;
    return !(confirmedSet.has(`${f.id}:${fx.home_club_id}`) && confirmedSet.has(`${f.id}:${fx.away_club_id}`));
  });
  console.log(`missing at least one side's lineup: ${missing.length}`);

  const distinctDates = new Set(fixtures.map((f) => new Date(f.kickoff_at).toISOString().slice(0, 10)));
  console.log(`distinct kickoff dates involved: ${distinctDates.size}`);
  console.log('estimated getMatches() calls (grouped by country+date, 5 leagues):', distinctDates.size * 5, '(upper bound, many will have 0 fixtures for a given league)');
  console.log('estimated getLineups() calls (one per fixture missing a lineup):', missing.length);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('diagnostic failed:', err);
    process.exit(1);
  });
