// One-off diagnostic: user reports Ligue 1 still has noticeably fewer
// transfer cards than the other leagues even after the both-clubs filter
// was loosened. Companion to the pre-existing diagnoseSourceVolume.js
// (which already re-checks rmcsport's raw fetch + relevance.js pass rate
// live) -- this half instead pulls the actual DB volumes, to see how
// large the gap really is and whether it's a fetch-time problem, a
// relevance-filter problem, or just a genuinely quieter source. Read-only,
// no DB writes.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';

async function main() {
  const supabase = getSupabaseClient();

  console.log('--- seen_news_items count per source (all-time) ---');
  for (const league of LEAGUES) {
    const { count, error } = await supabase
      .from('seen_news_items')
      .select('*', { count: 'exact', head: true })
      .eq('source', league.newsSource);
    if (error) throw error;
    console.log(`${league.slug} (${league.newsSource}): ${count} items ever seen`);
  }

  console.log('\n--- transfers row count per league (all-time, and last 7 days) ---');
  const { data: dbLeagues, error: leaguesErr } = await supabase.from('leagues').select('id, slug');
  if (leaguesErr) throw leaguesErr;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  for (const l of dbLeagues) {
    const { count: total, error: totalErr } = await supabase
      .from('transfers')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', l.id);
    if (totalErr) throw totalErr;
    const { count: recent, error: recentErr } = await supabase
      .from('transfers')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', l.id)
      .gte('published_at', sevenDaysAgo);
    if (recentErr) throw recentErr;
    console.log(`${l.slug}: ${total} total, ${recent} in last 7 days`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
