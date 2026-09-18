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
import Parser from 'rss-parser';
import { getSupabaseClient } from '../db/supabaseClient.js';

// Matches each generalSources/*.js file's own feedUrlEnvVar/defaultFeedUrl --
// createRssSource() doesn't expose those back out (only {sourceKey,
// fetchLatest}), so re-declared here rather than reaching into the module.
const ZERO_IMAGE_SOURCES = [
  { sourceKey: 'bundesliga-com', feedUrlEnvVar: 'BUNDESLIGA_COM_RSS_URL', defaultFeedUrl: 'https://www.bundesliga.com/en/rss/news' },
  { sourceKey: 'kicker-general', feedUrlEnvVar: 'KICKER_GENERAL_RSS_URL', defaultFeedUrl: 'https://newsfeed.kicker.de/news/bundesliga' },
  { sourceKey: 'gazzetta', feedUrlEnvVar: 'GAZZETTA_RSS_URL', defaultFeedUrl: 'https://www.gazzetta.it/rss/calcio.xml' },
  { sourceKey: 'bbc-football', feedUrlEnvVar: 'BBC_FOOTBALL_RSS_URL', defaultFeedUrl: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { sourceKey: 'guardian-football', feedUrlEnvVar: 'GUARDIAN_FOOTBALL_RSS_URL', defaultFeedUrl: 'https://www.theguardian.com/football/rss' },
];

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

  // Per-source null rate across ALL recent rows (not just the ones that
  // have an image_url) -- a source with a 100% null rate never triggers
  // NewsCard.jsx's onError/hotlink path at all, it just always renders the
  // gray placeholder, which looks identical to a "failed to load" image
  // from the user's side but has a completely different cause.
  const { data: allRows, error: allErr } = await supabase
    .from('news_articles')
    .select('source, image_url')
    .order('published_at', { ascending: false })
    .limit(400);
  if (allErr) throw allErr;
  const nullRateBySource = new Map();
  for (const row of allRows) {
    const stat = nullRateBySource.get(row.source) || { total: 0, withImage: 0 };
    stat.total += 1;
    if (row.image_url) stat.withImage += 1;
    nullRateBySource.set(row.source, stat);
  }
  console.log('image_url presence per source (most recent 400 articles):');
  for (const [source, stat] of nullRateBySource) {
    console.log(`  ${source}: ${stat.withImage}/${stat.total} have an image_url`);
  }
  console.log();

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

  const suspiciousContentType = results.filter((r) => r.noReferer.contentType && !/^image\//.test(r.noReferer.contentType));
  if (suspiciousContentType.length > 0) {
    console.log(`\nNon-image content-type (likely a tracking pixel picked up from inline HTML, not a real thumbnail):`);
    for (const r of suspiciousContentType) console.log(`  - ${r.source} (${r.host}): ${r.noReferer.contentType}`);
  }

  console.log(`\n\nWhy do these sources' rows always have image_url = null? Re-fetching each feed raw (bypassing extractImage()) to see what image-shaped fields, if any, the item actually carries.\n`);
  const rawParser = new Parser({
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  });
  for (const source of ZERO_IMAGE_SOURCES) {
    try {
      const feedUrl = process.env[source.feedUrlEnvVar] || source.defaultFeedUrl;
      const feed = await rawParser.parseURL(feedUrl);
      const first = feed.items[0];
      if (!first) {
        console.log(`[${source.sourceKey}] feed returned 0 items\n`);
        continue;
      }
      const relevantKeys = Object.keys(first).filter((k) => /image|thumb|media|enclosure|content/i.test(k));
      console.log(`[${source.sourceKey}] item keys matching image/media/content: ${JSON.stringify(relevantKeys)}`);
      for (const k of relevantKeys) {
        const val = first[k];
        const preview = typeof val === 'string' ? val.slice(0, 200) : JSON.stringify(val).slice(0, 300);
        console.log(`  ${k}: ${preview}`);
      }
      console.log();
    } catch (err) {
      console.log(`[${source.sourceKey}] raw fetch failed: ${err.message}\n`);
    }
  }
}

main().catch((err) => {
  console.error('Diagnose failed:', err);
  process.exitCode = 1;
});
