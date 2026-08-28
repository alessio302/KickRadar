// One-off: user reports the official lineup for Elche vs Racing Santander
// (LaLiga) is already out, but no push arrived. Checks the fixture's
// kickoff time against syncLineups.js's near-kickoff window (LOOKBACK_MIN
// -20 / LOOKAHEAD_MIN +45) and whatever lineups rows already exist for it,
// to see whether this is "sync never ran during the real window" (today's
// GitHub Actions scheduler outage) or something else. Read-only, no DB
// writes.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, name, short_name')
    .or('name.ilike.%elche%,name.ilike.%racing%,short_name.ilike.%elche%,short_name.ilike.%racing%');
  if (clubsErr) throw clubsErr;
  console.log('Matching clubs:', JSON.stringify(clubs, null, 2));

  const clubIds = clubs.map((c) => c.id);
  const { data: fixtures, error: fixturesErr } = await supabase
    .from('fixtures')
    .select('id, home_club_id, away_club_id, kickoff_at, status')
    .or(`home_club_id.in.(${clubIds.join(',')}),away_club_id.in.(${clubIds.join(',')})`)
    .order('kickoff_at', { ascending: true });
  if (fixturesErr) throw fixturesErr;
  console.log('Matching fixtures:', JSON.stringify(fixtures, null, 2));

  const now = new Date();
  for (const f of fixtures) {
    const kickoff = new Date(f.kickoff_at);
    const minsUntilKickoff = (kickoff - now) / 60000;
    console.log(`Fixture ${f.id}: kickoff in ${minsUntilKickoff.toFixed(1)} min (LOOKAHEAD window is +45/-20)`);

    const { data: lineups, error: lineupsErr } = await supabase
      .from('lineups')
      .select('*')
      .eq('fixture_id', f.id);
    if (lineupsErr) throw lineupsErr;
    console.log(`  lineups rows: ${JSON.stringify(lineups, null, 2)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
