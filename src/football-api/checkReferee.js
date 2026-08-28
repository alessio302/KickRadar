// One-off: after manually re-running fixtures-sync (GitHub Actions
// scheduler outage meant it hadn't run since 01:19 UTC), check whether
// fixture 1552 (Racing Santander vs Elche CF) now has a referee. Read-only.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('fixtures').select('id, referee, kickoff_at').eq('id', 1552).single();
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
