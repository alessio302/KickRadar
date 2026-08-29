// Read-only: user-reported false positive -- an article about Lucumí
// possibly starting for Juventus vs Parma got extracted as a
// Juventus -> Bologna transfer rumor. Confirm the exact stored row before
// deciding whether/how to remove it.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, is_official, source, source_url, summary, ai_summary_it, published_at')
    .ilike('player_name', '%lucum%');
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
