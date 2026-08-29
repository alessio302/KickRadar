import { getSupabaseClient } from '../db/supabaseClient.js';

// Throwaway read-only check: did the just-shipped live_minute column
// actually get populated by the currently-running live-events.yml job?
async function main() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, status, kickoff_at, live_minute, home_club_id, away_club_id')
    .eq('status', 'live');
  if (error) throw error;
  console.log('Live fixtures:', JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error('Check failed:', err);
  process.exitCode = 1;
});
