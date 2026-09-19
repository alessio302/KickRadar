// Temporary diagnostic (per this project's usual pattern) -- checking why
// guardian-football has 60 articles with image_url = null (across all
// leagues, not just Bundesliga). Fetches a few real, currently-null
// theguardian.com article URLs and dumps: HTTP status, response length,
// raw og:image/twitter:image tags (with byte offset), and what
// fetchOgImage() (already at a 400000-char cap) actually resolves.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { fetchOgImage } from './ogImage.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('news_articles')
    .select('title, source_url')
    .eq('source', 'guardian-football')
    .is('image_url', null)
    .order('published_at', { ascending: false })
    .limit(5);
  if (error) throw error;

  for (const row of rows) {
    console.log(`\n=== ${row.title} ===`);
    console.log(row.source_url);
    try {
      const res = await fetch(row.source_url, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
      });
      const html = await res.text();
      console.log('status:', res.status, 'content-length:', html.length);
      const ogMatches = [...html.matchAll(/<meta[^>]*(?:property|name)=["'](og:image[^"']*|twitter:image)["'][^>]*>/gi)];
      console.log('raw og/twitter image meta tags found:', ogMatches.length);
      for (const m of ogMatches) console.log('  offset', m.index, ':', m[0]);
      const resolved = await fetchOgImage(row.source_url);
      console.log('fetchOgImage() result:', resolved);
    } catch (err) {
      console.error('fetch failed:', err.message);
    }
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
