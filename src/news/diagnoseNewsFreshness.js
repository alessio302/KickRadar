import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';

// Throwaway diagnostic: user's complaint narrowed down from "the last 30min
// cycle found nothing" (confirmed benign) to "the last REAL transfer for
// premier-league/bundesliga/la-liga is 8+ hours old, during an active
// transfer window -- that's suspicious regardless of any single quiet
// cycle". Checks two independent signals per league: (1) how long ago the
// last actual transfers row landed, and (2) how recently seen_news_items
// grew for that source -- if seen_at is also stale, the scraper isn't even
// finding NEW candidate items lately (source itself went quiet, or the
// scraper stopped running for real); if seen_at is fresh but transfers
// isn't, items are being seen and rejected every cycle. Read-only, no writes.
async function main() {
  const supabase = getSupabaseClient();

  for (const league of LEAGUES) {
    const { data: lastTransfers, error: transferErr } = await supabase
      .from('transfers')
      .select('player_name, from_club, to_club, published_at, created_at, source, source_url')
      .eq('league_id', (await supabase.from('leagues').select('id').eq('slug', league.slug).single()).data.id)
      .order('created_at', { ascending: false })
      .limit(3);
    if (transferErr) throw transferErr;

    const { data: lastSeen, error: seenErr } = await supabase
      .from('seen_news_items')
      .select('external_id, seen_at')
      .eq('source', league.newsSource)
      .order('seen_at', { ascending: false })
      .limit(3);
    if (seenErr) throw seenErr;

    const { count: seenLast8h, error: countErr } = await supabase
      .from('seen_news_items')
      .select('external_id', { count: 'exact', head: true })
      .eq('source', league.newsSource)
      .gte('seen_at', new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString());
    if (countErr) throw countErr;

    console.log(`\n=== ${league.slug} (${league.newsSource}) ===`);
    console.log('Last 3 transfers (by created_at):', JSON.stringify(lastTransfers, null, 2));
    console.log('Last 3 seen_news_items (by seen_at):', JSON.stringify(lastSeen, null, 2));
    console.log(`seen_news_items rows in last 8h: ${seenLast8h}`);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
