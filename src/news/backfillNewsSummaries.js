// One-off corrective pass, now covering two backlogs:
// 1. Rows inserted during News's first two live runs (2026-09-16/17) never
//    got an AI summary because gemini-3.6-flash's free-tier quota
//    (20 requests/day -- see llmSummarizeNews.js's own comment) was
//    exhausted almost immediately.
// 2. Rows inserted before the translated-headline feature (title_de etc.,
//    added 2026-09-17 per user feedback) have a summary but no translated
//    title.
// Both are permanently stuck otherwise -- runGeneralNewsScraper.js only
// ever calls the LLM once per item, on first sight, and marks it seen
// (seen_news_items) regardless of the call's outcome, so a plain re-run of
// the scraper never revisits them. Targets rows missing title_de (a
// superset of rows missing ai_summary_de, since both come from the same
// LLM call) so one pass covers both backlogs.
//
// Run once via backfill-news-summaries.yml (workflow_dispatch only).
import { getSupabaseClient } from '../db/supabaseClient.js';
import { llmSummarizeNews } from './llmSummarizeNews.js';

export async function backfillNewsSummaries() {
  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('news_articles')
    .select('id, title, teaser')
    .is('title_de', null)
    .order('published_at', { ascending: false });
  if (error) throw error;

  console.log(`${rows.length} news_articles rows missing a translated title/summary.`);

  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    let result;
    try {
      result = await llmSummarizeNews(row.title, row.teaser);
    } catch (err) {
      console.warn(`[${row.id}] summarization failed:`, err.message);
      failed += 1;
      continue;
    }
    const { error: updateErr } = await supabase
      .from('news_articles')
      .update({
        title_de: result.title.de,
        title_en: result.title.en,
        title_it: result.title.it,
        title_fr: result.title.fr,
        title_es: result.title.es,
        ai_summary_de: result.summary.de,
        ai_summary_en: result.summary.en,
        ai_summary_it: result.summary.it,
        ai_summary_fr: result.summary.fr,
        ai_summary_es: result.summary.es,
      })
      .eq('id', row.id);
    if (updateErr) {
      console.error(`[${row.id}] failed to store summary:`, updateErr.message);
      failed += 1;
      continue;
    }
    updated += 1;
  }

  return { total: rows.length, updated, failed };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  backfillNewsSummaries()
    .then((result) => {
      console.log('Backfill complete:', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Backfill failed:', err);
      process.exitCode = 1;
    });
}
