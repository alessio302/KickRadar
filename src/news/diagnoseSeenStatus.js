import { getSupabaseClient } from '../db/supabaseClient.js';
import marca from './sources/marca.js';
import skysports from './sources/skysports.js';
import kicker from './sources/kicker.js';
import { isTransferRelevant } from './relevance.js';

// Throwaway diagnostic: the sources themselves return real, fresh items
// (confirmed live in a prior check), but production runs show 0 inserted
// for premier-league/bundesliga/la-liga. Is that because every fetched
// item is already in seen_news_items (expected, benign -- the site's own
// list just hasn't turned over since the last run), or because something
// new is failing relevance/extraction? Read-only, no writes.
function externalIdFor(item) {
  return item.guid || item.link;
}

async function check(sourceKey, source) {
  const supabase = getSupabaseClient();
  const { data: seenRows, error } = await supabase.from('seen_news_items').select('external_id').eq('source', sourceKey);
  if (error) throw error;
  const knownIds = new Set(seenRows.map((r) => r.external_id));

  const items = await source.fetchLatest();
  const unseen = items.filter((item) => !knownIds.has(externalIdFor(item)));
  const relevant = unseen.filter((item) => isTransferRelevant(sourceKey, `${item.title} ${item.summary || ''}`));

  console.log(`${sourceKey}: ${items.length} fetched, ${seenRows.length} known seen ids, ${unseen.length} unseen, ${relevant.length} unseen+relevant`);
  console.log(`${sourceKey} unseen+relevant titles:`, JSON.stringify(relevant.map((i) => i.title), null, 2));
  console.log(`${sourceKey} unseen but NOT relevant titles:`, JSON.stringify(unseen.filter((i) => !relevant.includes(i)).map((i) => i.title), null, 2));
}

async function main() {
  await check('marca', marca);
  await check('skysports', skysports);
  await check('kicker', kicker);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
