import { getSupabaseClient } from '../db/supabaseClient.js';
import { fetchArticleText } from './articleBody.js';
import { normalize } from '../util/normalize.js';

// Follow-up: why didn't the squad_memberships backfill (or the new
// runNewsScraper.js branch) recover from_club for the Ricci->Como row?
// Hypothesis: the extracted player_name is the bare surname "Ricci", but
// squad_memberships.normalized_name presumably stores full names
// ("samuele ricci"), and every squad lookup in this codebase does an EXACT
// match -- a bare surname would never match. Confirms that, and pulls the
// real article text for ground truth before fixing anything.
async function run() {
  const supabase = getSupabaseClient();

  const { data: row, error } = await supabase
    .from('transfers')
    .select('id, player_id, player_name, from_club, from_club_id, to_club, to_club_id, source, source_url, summary, is_official, published_at')
    .eq('id', '6bb0f79c-79d5-4a29-8eb5-a78609377992')
    .single();
  if (error) throw error;
  console.log('transfer row:', JSON.stringify(row, null, 2));

  console.log('\n--- squad_memberships rows matching "%ricci%" ---');
  const { data: squadMatches, error: squadErr } = await supabase
    .from('squad_memberships')
    .select('normalized_name, club_id')
    .ilike('normalized_name', '%ricci%');
  if (squadErr) throw squadErr;
  for (const s of squadMatches) console.log(' ', JSON.stringify(s));

  console.log('\n--- exact match for extracted player_name ---');
  const exact = squadMatches.filter((s) => s.normalized_name === normalize(row.player_name));
  console.log(`normalize("${row.player_name}") = "${normalize(row.player_name)}" -- exact matches: ${exact.length}`);

  console.log('\n--- suffix match (ends with " " + surname) ---');
  const suffixPattern = ' ' + normalize(row.player_name);
  const suffixMatches = squadMatches.filter((s) => s.normalized_name.endsWith(suffixPattern));
  console.log(`suffix "${suffixPattern}" -- matches: ${suffixMatches.length}`);
  for (const s of suffixMatches) console.log(' ', JSON.stringify(s));

  if (row.source_url) {
    console.log('\n--- real article text (for ground truth) ---');
    const text = await fetchArticleText(row.source_url);
    console.log(text ? text.slice(0, 1500) : '(fetch failed or empty)');
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('diagnostic failed:', err);
    process.exit(1);
  });
