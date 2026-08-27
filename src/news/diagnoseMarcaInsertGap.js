import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { getSupabaseClient } from '../db/supabaseClient.js';

// Follow-up to the marca zero-inserts investigation: the catch-up run
// fetched marca's 49-item list but only inserted 1 la-liga transfer. Is
// that "46 of 49 were already known from earlier runs, only a few
// genuinely new" (expected/correct), or something dropping items it
// shouldn't? Read-only -- mirrors scrapeLeague()'s own knownIds check
// exactly (see runNewsScraper.js). marca has no relevance.js keyword gate
// (fail-open, see relevance.js's own comment on why), so that stage isn't
// where any rejection happens for this source -- not replicated here.
const LIST_URL = 'https://www.marca.com/futbol/mercado-fichajes.html';
const SELECTOR = '.ue-c-cover-content__link';
const HUB_PAGE_PATTERN = /^mercado de fichajes.*(en directo|altas,?\s*bajas)/i;

function externalIdFor(link) {
  return createHash('sha256').update(link).digest('hex');
}

async function run() {
  const supabase = getSupabaseClient();

  const res = await fetch(LIST_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const items = [];
  $(SELECTOR).each((_, el) => {
    const title = $(el).text().trim();
    let link = $(el).attr('href');
    if (link && !link.startsWith('http')) link = new URL(link, 'https://www.marca.com').toString();
    if (title && link) items.push({ title, link });
  });
  const realItems = items.filter((item) => !HUB_PAGE_PATTERN.test(item.title));
  console.log(`fetched ${items.length} raw items, ${realItems.length} after hub-page filter`);

  const { data: seenRows, error: seenErr } = await supabase
    .from('seen_news_items')
    .select('external_id')
    .eq('source', 'marca');
  if (seenErr) throw seenErr;
  const knownIds = new Set(seenRows.map((r) => r.external_id));
  console.log('total seen_news_items rows for source=marca:', knownIds.size);

  let alreadyKnown = 0;
  let newItems = 0;
  for (const item of realItems) {
    const id = externalIdFor(item.link);
    if (knownIds.has(id)) {
      alreadyKnown += 1;
      continue;
    }
    newItems += 1;
    console.log(`  [NEW since last run] ${item.title}`);
  }
  console.log(`\nalready known (seen in an earlier run): ${alreadyKnown}, genuinely new this fetch: ${newItems}`);

  const { data: recentTransfers, error: transfersErr } = await supabase
    .from('transfers')
    .select('player_name, from_club, to_club, source, summary, created_at')
    .eq('source', 'marca')
    .order('created_at', { ascending: false })
    .limit(8);
  if (transfersErr) throw transfersErr;
  console.log('\nmost recent transfers rows with source=marca:');
  for (const t of recentTransfers) {
    console.log(`  ${t.player_name}: ${t.from_club} -> ${t.to_club} | created_at=${t.created_at} | "${t.summary}"`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('diagnostic failed:', err);
    process.exit(1);
  });
