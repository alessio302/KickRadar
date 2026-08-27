import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../db/supabaseClient.js';

// Follow-up to diagnoseMarcaZero.js: that confirmed marca.com itself is
// fine (200 OK, 49 real items, selector matches). So the recurring
// `la-liga: { inserted: 0, skipped: 0, merged: 0 }` in every recent
// news-scraper run must mean every fetched item's externalId is already in
// seen_news_items (that's the only path through scrapeLeague() that skips
// the counters entirely -- see runNewsScraper.js's `continue` on
// knownIds.has(externalId), before either counter increments). Checks
// whether that's genuinely true right now, or whether something is marking
// items "seen" without ever actually processing them. Read-only.
function externalIdFor(link) {
  return createHash('sha256').update(link).digest('hex');
}

const FRESH_ITEMS = [
  'https://www.marca.com/futbol/premier-league/2026/08/27/hay-acuerdo-psg-liverpool-barcola-140-millones-euros.html',
  'https://www.marca.com/futbol/rayo/2026/08/27/gnangoro-bouare-ficha-cinco-temporadas-rayo-vallecano.html',
  'https://www.marca.com/futbol/leganes/2026/08/27/morata-cerca-leganes.html',
];

async function run() {
  const supabase = getSupabaseClient();

  const { count: seenCount, error: seenCountErr } = await supabase
    .from('seen_news_items')
    .select('external_id', { count: 'exact', head: true })
    .eq('source', 'marca');
  if (seenCountErr) throw seenCountErr;
  console.log('seen_news_items rows for source=marca:', seenCount);

  for (const link of FRESH_ITEMS) {
    const id = externalIdFor(link);
    const { data, error } = await supabase
      .from('seen_news_items')
      .select('external_id')
      .eq('source', 'marca')
      .eq('external_id', id)
      .maybeSingle();
    if (error) throw error;
    console.log(`  "${link.split('/').pop()}" already in seen_news_items?`, !!data);
  }

  const { data: recentTransfers, error: transfersErr } = await supabase
    .from('transfers')
    .select('player_name, from_club, to_club, source, published_at, created_at')
    .eq('source', 'marca')
    .order('created_at', { ascending: false })
    .limit(5);
  if (transfersErr) throw transfersErr;
  console.log('most recent transfers rows with source=marca:');
  for (const t of recentTransfers) {
    console.log(`  ${t.player_name}: ${t.from_club} -> ${t.to_club} | published_at=${t.published_at} created_at=${t.created_at}`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('diagnostic failed:', err);
    process.exit(1);
  });
