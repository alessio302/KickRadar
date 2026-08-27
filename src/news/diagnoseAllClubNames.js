// One-off diagnostic: full listing of every curated club's name/short_name/
// aliases across all 5 leagues, to ground a cross-language alias sweep
// (the user asked to check club names across languages after the OGC
// Nice/"Nizza" duplicate) in real data instead of guessing ids. Read-only.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();
  const { data: clubs, error } = await supabase
    .from('clubs')
    .select('id, league_id, name, short_code, short_name, aliases')
    .order('league_id')
    .order('name');
  if (error) throw error;

  console.log(`--- ${clubs.length} clubs total ---`);
  for (const c of clubs) {
    console.log(`${c.id}\t league=${c.league_id}\t ${c.name}\t (${c.short_name || '-'})\t aliases=${JSON.stringify(c.aliases)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
