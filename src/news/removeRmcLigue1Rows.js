// One-off: user asked to remove the leftover rmcsport-sourced Ligue 1
// transfer rows now that footmercato.js is the sole Ligue 1 source, so the
// feed always shows one consistent source. Confirmed via
// diagnoseRmcLeftover.js: 19 rmcsport rows total, 12 of the 22 currently
// visible cards. Deletes those rows outright (not just hides them) -- they
// were the old source's own extraction, fully superseded now, and this
// project's convention for scraped/derived data is to actually remove
// what's been superseded rather than leave stale rows around (see e.g.
// the various dedup sweeps earlier in the project).
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();
  const { data: league, error: leagueErr } = await supabase.from('leagues').select('id').eq('slug', 'ligue-1').single();
  if (leagueErr) throw leagueErr;

  const { data: rows, error: selectErr } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, published_at')
    .eq('league_id', league.id)
    .eq('source', 'rmcsport');
  if (selectErr) throw selectErr;

  console.log(`Deleting ${rows.length} rmcsport-sourced ligue-1 rows:`);
  for (const t of rows) {
    console.log(`  #${t.id} ${t.player_name} (${t.from_club} -> ${t.to_club}) ${t.published_at}`);
  }

  const { error: deleteErr } = await supabase
    .from('transfers')
    .delete()
    .eq('league_id', league.id)
    .eq('source', 'rmcsport');
  if (deleteErr) throw deleteErr;

  console.log(`\nDone: deleted ${rows.length} rows.`);
}

main().catch((err) => {
  console.error('Delete pass failed:', err);
  process.exitCode = 1;
});
