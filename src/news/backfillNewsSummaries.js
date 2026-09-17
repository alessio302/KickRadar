// One-off corrective pass: news_articles rows inserted during News's first
// two live runs (2026-09-16/17) never got an AI summary because
// gemini-3.6-flash's free-tier quota (20 requests/day -- see
// llmSummarizeNews.js's own comment) was exhausted almost immediately.
// Those rows are permanently stuck without a summary otherwise --
// runGeneralNewsScraper.js only ever summarizes an item once, on first
// sight, and marks it seen (seen_news_items) regardless of whether the LLM
// call succeeded, so a plain re-run of the scraper never revisits them.
//
// Run once via backfill-news-summaries.yml (workflow_dispatch only).
import { getSupabaseClient } from '../db/supabaseClient.js';
import { llmSummarizeNews } from './llmSummarizeNews.js';

export async function backfillNewsSummaries() {
  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('news_articles')
    .select('id, title, teaser')
    .is('ai_summary_de', null)
    .order('published_at', { ascending: false });
  if (error) throw error;

  console.log(`${rows.length} news_articles rows missing a summary.`);

  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    let summary;
    try {
      summary = await llmSummarizeNews(row.title, row.teaser);
    } catch (err) {
      console.warn(`[${row.id}] summarization failed:`, err.message);
      failed += 1;
      continue;
    }
    const { error: updateErr } = await supabase
      .from('news_articles')
      .update({
        ai_summary_de: summary.de,
        ai_summary_en: summary.en,
        ai_summary_it: summary.it,
        ai_summary_fr: summary.fr,
        ai_summary_es: summary.es,
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
