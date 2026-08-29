// Read-only, one-off: verify syncFixtures.js's status-regression fix
// actually corrected the Lille-PSG row after re-running it.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, status, home_score, away_score, updated_at')
    .eq('external_fixture_id', 559702)
    .maybeSingle();
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
