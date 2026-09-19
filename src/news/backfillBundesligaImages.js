// One-off backfill (repo's usual pattern, see backfillNewsSummaries.js) --
// the 60000->400000 fetchOgImage() cap fix only applies going forward;
// the 32 bundesliga-com articles already stored with image_url = null
// never get touched again by runGeneralNewsScraper.js (it only resolves
// an image once per genuinely NEW article). Re-resolves each one directly.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { fetchOgImage } from './ogImage.js';

async function main() {
  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('news_articles')
    .select('id, title, source_url')
    .eq('source', 'bundesliga-com')
    .is('image_url', null);
  if (error) throw error;

  let fixed = 0;
  let stillNull = 0;
  for (const row of rows) {
    const image = await fetchOgImage(row.source_url);
    if (!image) {
      stillNull += 1;
      console.log(`still null: ${row.title}`);
      continue;
    }
    const { error: updateErr } = await supabase.from('news_articles').update({ image_url: image }).eq('id', row.id);
    if (updateErr) {
      console.error(`Failed to update ${row.id}:`, updateErr.message);
      continue;
    }
    fixed += 1;
  }

  console.log('Bundesliga image backfill complete:', { checked: rows.length, fixed, stillNull });
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exitCode = 1;
});
