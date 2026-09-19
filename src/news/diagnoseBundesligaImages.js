// Temporary diagnostic (per this project's usual pattern) -- verifies the
// fetchOgImage() 60000 -> 400000 char cap fix (og:image sits ~183000 chars
// into bundesliga.com's own pages, confirmed via this script's earlier
// version) actually resolves a real image now, against live article URLs.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { fetchOgImage } from './ogImage.js';

async function main() {
  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('news_articles')
    .select('title, source_url')
    .eq('source', 'bundesliga-com')
    .is('image_url', null)
    .order('published_at', { ascending: false })
    .limit(5);
  if (error) throw error;

  for (const row of rows) {
    const image = await fetchOgImage(row.source_url);
    console.log(`${image ? 'OK' : 'STILL NULL'}  ${row.title}`);
    if (image) console.log('   ->', image);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
