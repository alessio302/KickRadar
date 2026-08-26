import { getSupabaseClient } from '../db/supabaseClient.js';

// Read-only: dumps every club name currently in the DB, grouped by
// league, to cross-check against clubKitColors.js's keys and find any
// missing entries (confirmed live: Valencia CF was one).
async function main() {
  const supabase = getSupabaseClient();
  const { data: leagues, error: leagueErr } = await supabase.from('leagues').select('id, slug').order('slug');
  if (leagueErr) throw leagueErr;

  for (const league of leagues) {
    const { data: clubs, error } = await supabase.from('clubs').select('name').eq('league_id', league.id).order('name');
    if (error) throw error;
    console.log(`--- ${league.slug} (${clubs.length}) ---`);
    for (const c of clubs) console.log(c.name);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
