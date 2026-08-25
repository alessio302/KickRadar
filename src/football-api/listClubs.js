import { getSupabaseClient } from '../db/supabaseClient.js';

// Read-only diagnostic (no DB writes): dumps every synced club's exact
// name/short_code, grouped by league, so a curated kit-color map can be
// keyed against the real, currently-synced data instead of guessed names.
async function run() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('clubs')
    .select('id, name, short_code, leagues(slug, name)')
    .order('league_id', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;

  let currentLeague = null;
  for (const c of data) {
    const leagueSlug = c.leagues?.slug;
    if (leagueSlug !== currentLeague) {
      currentLeague = leagueSlug;
      console.log(`\n=== ${c.leagues?.name} (${leagueSlug}) ===`);
    }
    console.log(`${c.short_code}\t${c.name}`);
  }
  console.log(`\nTotal: ${data.length} clubs`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
