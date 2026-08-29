// One-off: regenerate the Barcola transfer's AI summary now that
// articleBody.js's <article>-scope fallback fix (see that file's own
// comment) can actually fetch footmercato.net's real article text --
// the row already in the DB was written before the fix, with only the
// bare headline to work from, so it stays thin until re-run once here.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { fetchArticleText } from './articleBody.js';
import { llmExtractTransferInfo } from './llmExtract.js';

async function main() {
  const supabase = getSupabaseClient();
  const { data: row, error } = await supabase
    .from('transfers')
    .select('id, player_name, source_url, summary')
    .ilike('player_name', '%barcola%')
    .single();
  if (error) throw error;

  const articleText = await fetchArticleText(row.source_url);
  console.log('re-fetched article length:', articleText?.length ?? 0);
  if (!articleText) throw new Error('Still no article text -- aborting, nothing to improve on.');

  const result = await llmExtractTransferInfo(row.summary, articleText);
  console.log('new extraction:', JSON.stringify(result, null, 2));

  const { error: updateErr } = await supabase
    .from('transfers')
    .update({
      ai_summary_de: result.aiSummary?.de ?? null,
      ai_summary_en: result.aiSummary?.en ?? null,
      ai_summary_it: result.aiSummary?.it ?? null,
      ai_summary_fr: result.aiSummary?.fr ?? null,
      ai_summary_es: result.aiSummary?.es ?? null,
    })
    .eq('id', row.id);
  if (updateErr) throw updateErr;
  console.log('Updated row', row.id);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
