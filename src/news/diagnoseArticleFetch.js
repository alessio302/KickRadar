// One-off: two specific rows (Mathieu Patouillet, Ahmed Touba) have
// consistently failed fetchArticleText() across two separate backfill
// runs, even with a 1.5s delay between requests -- ruling out a simple
// rate-limit theory. Fetches their exact stored source_url directly with
// full error/status visibility (fetchArticleText swallows all of this) to
// find the real cause. Read-only, no DB writes.
import { getSupabaseClient } from '../db/supabaseClient.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function inspect(label, url) {
  console.log(`\n=== ${label} ===`);
  console.log(`url: ${url}`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    console.log(`status: ${res.status} ${res.statusText}`);
    console.log(`content-type: ${res.headers.get('content-type')}`);
    const html = await res.text();
    console.log(`body length: ${html.length} chars`);
    console.log(`first 300 chars: ${html.slice(0, 300).replace(/\s+/g, ' ')}`);
  } catch (err) {
    console.log(`fetch threw: ${err.name}: ${err.message}`);
    if (err.cause) console.log(`  cause: ${err.cause}`);
  }
}

async function main() {
  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('transfers')
    .select('id, player_name, to_club, source, source_url')
    .in('player_name', ['Mathieu Patouillet', 'Ahmed Touba'])
    .is('from_club', null);
  if (error) throw error;

  for (const t of rows) {
    await inspect(`#${t.id} ${t.player_name} (${t.source})`, t.source_url);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
