// One-off: user asked whether old RMC Sport-sourced Ligue 1 transfer rows
// (from before the footmercato.js switch) should stay or go, since the
// feed now mixes two source labels for the same league. Checking how many
// there actually are, and where they currently rank in the feed (by
// published_at, same ordering useTransfers.js uses) before deciding.
// Read-only, no DB writes.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();
  const { data: league, error: leagueErr } = await supabase.from('leagues').select('id').eq('slug', 'ligue-1').single();
  if (leagueErr) throw leagueErr;

  const { count: rmcCount, error: rmcErr } = await supabase
    .from('transfers')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', league.id)
    .eq('source', 'rmcsport');
  if (rmcErr) throw rmcErr;
  console.log(`rmcsport-sourced ligue-1 rows: ${rmcCount}`);

  const { count: totalCount, error: totalErr } = await supabase
    .from('transfers')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', league.id);
  if (totalErr) throw totalErr;
  console.log(`total ligue-1 rows: ${totalCount}`);

  // Same completeness filter useTransfers.js applies, so we see how many
  // rmcsport rows actually still show in the app right now.
  const { data: visible, error: visErr } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, source, published_at')
    .eq('league_id', league.id)
    .not('player_name', 'is', null)
    .not('from_club', 'is', null)
    .not('to_club', 'is', null)
    .order('published_at', { ascending: false })
    .limit(50);
  if (visErr) throw visErr;

  console.log(`\n--- ${visible.length} rows currently visible in the app (published_at desc, limit 50) ---`);
  visible.forEach((t, i) => {
    console.log(`${i + 1}. [${t.source}] ${t.player_name} (${t.from_club} -> ${t.to_club}) ${t.published_at}`);
  });
  const visibleRmc = visible.filter((t) => t.source === 'rmcsport');
  console.log(`\n${visibleRmc.length} of the ${visible.length} currently-visible rows are still rmcsport.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
