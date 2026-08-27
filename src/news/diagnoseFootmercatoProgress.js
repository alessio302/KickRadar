// One-off: the manually-triggered news-scraper run hit its 20-min timeout
// mid-way through processing footmercato's large first-time backlog
// (worsened by a concurrent Gemini 503 outage that slowed every call down
// with retries before falling back to the regex heuristic). Checking how
// much actually made it into the DB before cancellation, and how much of
// the raw footmercato feed is still unprocessed for the next cron tick to
// pick up. Read-only, no DB writes.
import { getSupabaseClient } from '../db/supabaseClient.js';
import footmercato from './sources/footmercato.js';

async function main() {
  const supabase = getSupabaseClient();

  const { count: seenCount, error: seenErr } = await supabase
    .from('seen_news_items')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'footmercato');
  if (seenErr) throw seenErr;
  console.log(`seen_news_items for footmercato: ${seenCount}`);

  const { data: league, error: leagueErr } = await supabase.from('leagues').select('id').eq('slug', 'ligue-1').single();
  if (leagueErr) throw leagueErr;
  const { count: transferCount, error: transferErr } = await supabase
    .from('transfers')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', league.id);
  if (transferErr) throw transferErr;
  console.log(`transfers rows for ligue-1: ${transferCount}`);

  const { data: recent, error: recentErr } = await supabase
    .from('transfers')
    .select('player_name, from_club, to_club, is_official, published_at')
    .eq('league_id', league.id)
    .order('published_at', { ascending: false })
    .limit(10);
  if (recentErr) throw recentErr;
  console.log('--- 10 most recent ligue-1 transfers ---');
  for (const t of recent) {
    console.log(`  ${t.player_name} (${t.from_club} -> ${t.to_club}) official=${t.is_official} published_at=${t.published_at}`);
  }

  const liveItems = await footmercato.fetchLatest();
  console.log(`\nfootmercato.fetchLatest() right now: ${liveItems.length} items on the page`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
