import { getSupabaseClient } from '../db/supabaseClient.js';

// Read-only: the backfill run reported confirmed:74, but the user reports
// past-fixture lineups still don't show in the app (the Spielinfo timeline
// from the same run DOES show). Need the actual stored shape of a
// backfilled lineup row to tell whether the data itself is malformed
// (empty initialLineup despite teamIsPopulated() gating the upsert), or
// whether this is a frontend-side issue (fixture selection, useLineups,
// LineupList/PitchFormation rendering).
async function run() {
  const supabase = getSupabaseClient();

  const { data: recentLineups, error } = await supabase
    .from('lineups')
    .select('fixture_id, club_id, confirmed, formation, players, published_at, created_at')
    .order('created_at', { ascending: false })
    .limit(6);
  if (error) throw error;
  console.log(`most recent ${recentLineups.length} lineup rows:`);
  for (const l of recentLineups) {
    const players = l.players || {};
    const rows = players.initialLineup || [];
    const subs = players.substitutes || [];
    console.log(
      `  fixture ${l.fixture_id} club ${l.club_id}: confirmed=${l.confirmed} formation=${l.formation} rows=${rows.length} subs=${subs.length} created_at=${l.created_at}`
    );
  }

  if (recentLineups.length > 0) {
    const sampleFixtureId = recentLineups[0].fixture_id;
    const { data: fixture, error: fxErr } = await supabase
      .from('fixtures')
      .select('id, status, kickoff_at, home_club_id, away_club_id')
      .eq('id', sampleFixtureId)
      .single();
    if (fxErr) throw fxErr;
    console.log('\nsample fixture row:', JSON.stringify(fixture));

    const { data: allLineupsForFixture, error: allErr } = await supabase
      .from('lineups')
      .select('club_id, confirmed')
      .eq('fixture_id', sampleFixtureId);
    if (allErr) throw allErr;
    console.log('all lineup rows for that fixture:', JSON.stringify(allLineupsForFixture));

    console.log('\nfull players JSON for the first row:');
    console.log(JSON.stringify(recentLineups[0].players, null, 2).slice(0, 2000));
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('diagnostic failed:', err);
    process.exit(1);
  });
