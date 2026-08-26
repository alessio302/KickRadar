import { getSupabaseClient } from '../db/supabaseClient.js';

// Read-only: dumps every LaLiga fixture (matchday, kickoff, status, clubs)
// sorted by kickoff_at, to see the real matchday assignment pattern behind
// the "giornata 2 shows finished results, giornata 1 only has 4 games"
// report. No writes.
async function main() {
  const supabase = getSupabaseClient();

  const { data: league, error: leagueErr } = await supabase.from('leagues').select('id').eq('slug', 'la-liga').single();
  if (leagueErr) throw leagueErr;

  const { data: clubs, error: clubsErr } = await supabase.from('clubs').select('id, name').eq('league_id', league.id);
  if (clubsErr) throw clubsErr;
  const clubName = new Map(clubs.map((c) => [c.id, c.name]));

  const { data: fixtures, error } = await supabase
    .from('fixtures')
    .select('id, matchday, home_club_id, away_club_id, kickoff_at, status, home_score, away_score, external_fixture_id')
    .eq('league_id', league.id)
    .order('kickoff_at', { ascending: true });
  if (error) throw error;

  console.log(`Total LaLiga fixtures: ${fixtures.length}`);
  for (const f of fixtures) {
    console.log(
      `matchday=${f.matchday} kickoff=${f.kickoff_at} status=${f.status} score=${f.home_score ?? '-'}:${f.away_score ?? '-'} ` +
        `${clubName.get(f.home_club_id)} vs ${clubName.get(f.away_club_id)} (ext=${f.external_fixture_id}, id=${f.id})`
    );
  }

  const byMatchday = new Map();
  for (const f of fixtures) {
    const key = f.matchday ?? 'NULL';
    byMatchday.set(key, (byMatchday.get(key) || 0) + 1);
  }
  console.log('--- counts per matchday ---');
  for (const [md, count] of [...byMatchday.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    console.log(`matchday ${md}: ${count} fixture(s)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
