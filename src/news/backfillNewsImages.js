// One-off backfill (repo's usual pattern, see backfillNewsSummaries.js) --
// the fetchOgImage() read-cap fix (#196/#197) and the fallback itself only
// ever apply going forward; runGeneralNewsScraper.js resolves an image
// once per genuinely NEW article, so any row already stored with
// image_url = null before a given fix never gets touched again on its
// own. Confirmed live (2026-09-19): guardian-football/bbc-football rows
// resolve a real og:image fine right now when fetchOgImage() is called
// live against them -- these are just old rows predating the fix, not a
// remaining code bug. Re-resolves every currently-null row across every
// source EXCEPT kicker-general, which is excluded on purpose: kicker.de
// serves an AWS WAF JS bot-challenge page instead of the real article for
// every plain HTTP request, confirmed via diagnoseBundesligaImages.js --
// no read-cap or header tweak fixes that, so retrying it here would just
// burn the whole run's time on 51 guaranteed failures.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { fetchOgImage } from './ogImage.js';

const SKIP_SOURCES = ['kicker-general'];

async function main() {
  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('news_articles')
    .select('id, source, title, source_url')
    .is('image_url', null)
    .not('source', 'in', `(${SKIP_SOURCES.map((s) => `"${s}"`).join(',')})`);
  if (error) throw error;

  const bySource = {};
  let fixed = 0;
  let stillNull = 0;
  for (const row of rows) {
    const image = await fetchOgImage(row.source_url);
    bySource[row.source] ??= { checked: 0, fixed: 0 };
    bySource[row.source].checked += 1;
    if (!image) {
      stillNull += 1;
      console.log(`[${row.source}] still null: ${row.title}`);
      continue;
    }
    const { error: updateErr } = await supabase.from('news_articles').update({ image_url: image }).eq('id', row.id);
    if (updateErr) {
      console.error(`Failed to update ${row.id}:`, updateErr.message);
      continue;
    }
    fixed += 1;
    bySource[row.source].fixed += 1;
  }

  console.log('News image backfill complete:', { checked: rows.length, fixed, stillNull, bySource });
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exitCode = 1;
});
