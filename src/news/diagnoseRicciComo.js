import { getSupabaseClient } from '../db/supabaseClient.js';
import tuttomercatoweb from './sources/tuttomercatoweb.js';
import { isTransferRelevant } from './relevance.js';

// Read-only diagnostic for a reported missing story: "Samuele Ricci
// (Milan) to Como, loan + EUR22m option" -- reported via a third-party
// app's push notification ~2h before this check. Serie A's only source is
// tuttomercatoweb; need to know whether the story is even present in its
// feed yet (a single-outlet source can simply be slower than a large
// aggregator app pulling from many outlets/wire services at once), or
// whether it's present but got rejected/lost somewhere in our own
// pipeline (relevance filter, already in seen_news_items, LLM extraction).
async function run() {
  const supabase = getSupabaseClient();

  console.log('--- live tuttomercatoweb feed ---');
  const items = await tuttomercatoweb.fetchLatest();
  console.log(`fetched ${items.length} raw items`);
  const matches = items.filter((i) => /ricci|como/i.test(i.title) || /ricci|como/i.test(i.summary || ''));
  console.log(`items mentioning "ricci" or "como": ${matches.length}`);
  for (const m of matches) {
    console.log(`  [${m.publishedAt}] ${m.title} | summary="${(m.summary || '').slice(0, 200)}" | link=${m.link}`);
    console.log(`    relevant per relevance.js? ${isTransferRelevant('tuttomercatoweb', `${m.title} ${m.summary || ''}`)}`);
  }

  console.log('\n--- DB: transfers mentioning Ricci ---');
  const { data: transferRows, error: transferErr } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, source, is_official, published_at, created_at')
    .ilike('player_name', '%ricci%');
  if (transferErr) throw transferErr;
  console.log(`found ${transferRows.length} rows`);
  for (const r of transferRows) console.log(' ', JSON.stringify(r));

  console.log('\n--- DB: seen_news_items for tuttomercatoweb mentioning any Ricci/Como link pattern ---');
  // seen_news_items only stores a hash, not the title -- can't search it
  // directly, but we can check whether each *currently listed* Ricci/Como
  // item's own externalId is already marked seen (would mean our pipeline
  // saw it and rejected it somewhere past the relevance gate).
  const { createHash } = await import('node:crypto');
  for (const m of matches) {
    const id = createHash('sha256').update(m.guid || m.link).digest('hex');
    const { data: seenRow, error: seenErr } = await supabase
      .from('seen_news_items')
      .select('external_id')
      .eq('source', 'tuttomercatoweb')
      .eq('external_id', id)
      .maybeSingle();
    if (seenErr) throw seenErr;
    console.log(`  "${m.title}" already in seen_news_items?`, !!seenRow);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('diagnostic failed:', err);
    process.exit(1);
  });
