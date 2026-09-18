// Diagnostic: user-reported (2026-09-18) "some News card images load, some
// don't". NewsCard.jsx renders article.image_url as a plain hotlinked
// <img src>, straight from whatever URL each outlet's own RSS feed happens
// to carry (rssSource.js's extractImage()) -- no proxying, no self-hosting.
// This is the exact same shape of bug already confirmed once this session
// for broadcaster logos (goal.com's CDN 200'd for a plain server-side
// fetch but silently failed to render in-browser -- referrer-based
// hotlink protection). Checks whether the same thing is happening here:
// fetch each stored image_url twice, once with no Referer (mimics a
// server-side / curl-style request) and once with Referer set to the
// production site's own origin (mimics what a real <img> tag loading
// cross-origin actually sends), and reports where the two diverge.
//
// Run via the diagnose-news-image-loading.yml action (workflow_dispatch).
import { getSupabaseClient } from '../db/supabaseClient.js';

const PROD_ORIGIN = 'https://kick-radar-eosin.vercel.app/';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function checkOnce(url, withReferer) {
  const headers = { 'User-Agent': BROWSER_UA, Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' };
  if (withReferer) headers.Referer = PROD_ORIGIN;
  try {
    const res = await fetch(url, { headers, redirect: 'follow' });
    return { status: res.status, contentType: res.headers.get('content-type') };
  } catch (err) {
    return { status: null, error: err.message };
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function main() {
  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('news_articles')
    .select('source, image_url')
    .not('image_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  const bySource = new Map();
  for (const row of rows) {
    if (!bySource.has(row.source)) bySource.set(row.source, row.image_url);
  }

  console.log(`Checking one image_url per source, ${bySource.size} sources, ${rows.length} rows scanned.\n`);

  const results = [];
  for (const [source, url] of bySource) {
    const noReferer = await checkOnce(url, false);
    const withReferer = await checkOnce(url, true);
    const flips = noReferer.status === 200 && withReferer.status !== 200;
    results.push({ source, host: hostOf(url), noReferer, withReferer, flips });
    console.log(
      `[${source}] ${hostOf(url)}\n  no-referer:   ${JSON.stringify(noReferer)}\n  with-referer: ${JSON.stringify(withReferer)}${flips ? '  <-- HOTLINK-PROTECTED (fails with our site as referer)' : ''}\n`
    );
  }

  const flipped = results.filter((r) => r.flips);
  console.log(`\nSummary: ${flipped.length}/${results.length} sources fail specifically when the request carries our production Referer:`);
  for (const r of flipped) console.log(`  - ${r.source} (${r.host})`);

  const otherFailures = results.filter((r) => !r.flips && (r.noReferer.status !== 200 || r.withReferer.status !== 200));
  if (otherFailures.length > 0) {
    console.log(`\nOther non-200s (fail regardless of referer -- likely dead/expired links, not hotlink protection):`);
    for (const r of otherFailures) console.log(`  - ${r.source} (${r.host}): no-referer=${r.noReferer.status} with-referer=${r.withReferer.status}`);
  }
}

main().catch((err) => {
  console.error('Diagnose failed:', err);
  process.exitCode = 1;
});
