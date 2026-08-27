import { getSupabaseClient } from '../db/supabaseClient.js';

// Read-only: the backfill's own stored data is confirmed correct
// (diagnoseBackfilledLineups.js showed a real, fully-populated example).
// Reported: the user still doesn't see lineups for past fixtures. Need to
// know the actual current coverage -- did the backfill leave a meaningful
// chunk of the 47 finished fixtures without a lineup (checked:41 out of
// 46 candidates suggests up to ~5-10 fixtures never resolved a Highlightly
// match or came back unpopulated), or is coverage actually high and the
// user happened to look at one of the few gaps?
const PAST_WINDOW_DAYS = 15;

async function run() {
  const supabase = getSupabaseClient();
  const cutoff = new Date(Date.now() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: fixtures, error } = await supabase
    .from('fixtures')
    .select('id, league_id, kickoff_at, home_club_id, away_club_id')
    .eq('status', 'finished')
    .gte('kickoff_at', cutoff);
  if (error) throw error;

  const { data: lineupRows, error: lineupErr } = await supabase
    .from('lineups')
    .select('fixture_id, club_id, confirmed')
    .in('fixture_id', fixtures.map((f) => f.id));
  if (lineupErr) throw lineupErr;
  const confirmedSet = new Set(lineupRows.filter((r) => r.confirmed).map((r) => `${r.fixture_id}:${r.club_id}`));

  const fullyCovered = [];
  const partiallyCovered = [];
  const notCovered = [];
  for (const f of fixtures) {
    const homeOk = confirmedSet.has(`${f.id}:${f.home_club_id}`);
    const awayOk = confirmedSet.has(`${f.id}:${f.away_club_id}`);
    if (homeOk && awayOk) fullyCovered.push(f);
    else if (homeOk || awayOk) partiallyCovered.push(f);
    else notCovered.push(f);
  }

  console.log(`total finished fixtures in window: ${fixtures.length}`);
  console.log(`fully covered (both sides): ${fullyCovered.length}`);
  console.log(`partially covered (one side): ${partiallyCovered.length}`);
  console.log(`not covered (neither side): ${notCovered.length}`);
  console.log('\nnot-covered fixture ids + kickoff:', notCovered.map((f) => `${f.id}@${f.kickoff_at}`).join(', '));
  console.log('partially-covered fixture ids + kickoff:', partiallyCovered.map((f) => `${f.id}@${f.kickoff_at}`).join(', '));
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('diagnostic failed:', err);
    process.exit(1);
  });
