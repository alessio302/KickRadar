// Temporary diagnostic (per this project's usual pattern) -- user reported
// Bundesliga.com news cards unreliably missing images. A DB check found
// this is actually the WORST case, not just "unreliable": 32/32 stored
// bundesliga-com articles have image_url = null, 100% failure, despite
// ogImage.js's fetchOgImage() fallback (added specifically for this
// source, per its own comment) supposedly covering exactly this gap.
// Fetches a few real, currently-stored bundesliga.com article URLs
// directly and dumps: HTTP status, response length, whether an og:image/
// twitter:image meta tag is present at all, and (if present) whether
// ogImage.js's own regexes actually match it -- to tell apart "the site
// stopped setting these tags", "we're being blocked/redirected", and "the
// tag is there but our regex doesn't match its exact attribute order".
import { getSupabaseClient } from '../db/supabaseClient.js';
import { fetchOgImage } from './ogImage.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('news_articles')
    .select('title, source_url')
    .eq('source', 'bundesliga-com')
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
      for (const m of ogMatches) console.log('  ', m[0]);
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
