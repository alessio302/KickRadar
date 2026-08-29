import { getSupabaseClient } from '../db/supabaseClient.js';

// Throwaway diagnostic: quick side-channel check of the backfill's live
// progress WITHOUT touching GOAL_API_KEY at all (this workflow's env only
// has Supabase secrets) -- so it's safe to run concurrently with
// backfillGoalApiProfiles.js's own run in news-scraper.yml without adding
// any extra GOAL API load or racing on the same rows. Just counts how many
// players still have no goal_api_id; comparing against the known starting
// count (394, after the first attempt's 22) shows whether the re-run is
// actually getting through or stuck against the rate limit again.
async function main() {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase.from('players').select('id', { count: 'exact', head: true }).is('goal_api_id', null);
  if (error) throw error;
  console.log(`Players still with no goal_api_id: ${count}`);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
