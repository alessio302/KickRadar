import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../db/supabaseClient.js';

const URL_TO_CHECK =
  'https://www.skysports.com/football/live-blog/11661/12476234/transfer-centre-live-football-transfer-news-updates-and-rumours';

function externalIdFor(link) {
  return createHash('sha256').update(link).digest('hex');
}

async function main() {
  const supabase = getSupabaseClient();
  const externalId = externalIdFor(URL_TO_CHECK);

  const { data: seenRows, error: seenErr } = await supabase
    .from('seen_news_items')
    .select('source, external_id, seen_at')
    .eq('source', 'skysports')
    .eq('external_id', externalId);
  if (seenErr) throw seenErr;
  console.log('seen_news_items match for this exact URL:', seenRows);

  const { data: exactTransfers, error: exactErr } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, source, source_url, published_at')
    .eq('source_url', URL_TO_CHECK);
  if (exactErr) throw exactErr;
  console.log('transfers rows with this exact source_url:', exactTransfers);

  const { data: liveBlogTransfers, error: likeErr } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, source, source_url, published_at')
    .eq('source', 'skysports')
    .ilike('source_url', '%/live-blog/%')
    .order('published_at', { ascending: false })
    .limit(20);
  if (likeErr) throw likeErr;
  console.log('any skysports transfers ever sourced from a /live-blog/ URL:', liveBlogTransfers);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
