// Read-only: user reported the Barcola (PSG -> Liverpool) AI summary is
// unusually thin/info-poor given the source article's apparent length.
// Pull the stored row (source_url, summary, ai_summary_*) and reproduce
// articleBody.js's exact extraction against that URL to see how much real
// article text the LLM actually got to work with.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { fetchArticleText } from './articleBody.js';

async function main() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, source, source_url, summary, ai_summary_it, published_at')
    .ilike('player_name', '%barcola%');
  if (error) throw error;
  console.log('--- stored row(s) ---');
  console.log(JSON.stringify(data, null, 2));

  for (const row of data) {
    console.log(`\n--- re-fetching article body for ${row.source_url} ---`);
    const text = await fetchArticleText(row.source_url);
    console.log('length:', text?.length ?? 0);
    console.log(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
