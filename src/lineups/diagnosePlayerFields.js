import { getSupabaseClient } from '../db/supabaseClient.js';
import { searchPlayers, getPlayer } from './goalApiClient.js';

// Throwaway diagnostic: what does our stored Paredes row actually look
// like, and what does GOAL API's FULL raw player profile contain (beyond
// the curated subset playerProfileResolver.js currently extracts)? Needed
// to answer the user's questions: add current club, clarify what season
// the stats are from, and what other fields could be shown. Read-only.
async function main() {
  const supabase = getSupabaseClient();

  const { data: rows, error } = await supabase.from('players').select('*').ilike('name', '%paredes%');
  if (error) throw error;
  console.log('Stored players matching "paredes":', JSON.stringify(rows, null, 2));

  const results = await searchPlayers('Leandro Paredes');
  console.log('GOAL API search results:', JSON.stringify(results, null, 2));

  if (results[0]) {
    const profile = await getPlayer(results[0].id);
    console.log('GOAL API FULL raw player profile:', JSON.stringify(profile, null, 2));
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
