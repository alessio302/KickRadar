// One-off: lists every club's name/short_name/external_team_id across all
// 5 leagues, grouped by league, so the standings table's display names
// (which read short_name) can be reviewed for nicknames/colloquial forms
// ("Barça", "Atleti") that don't match how real standings tables usually
// show a club, before deciding which ones actually need fixing. Read-only,
// no DB writes.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();
  const { data: leagues, error: leaguesErr } = await supabase.from('leagues').select('id, slug, name').order('slug');
  if (leaguesErr) throw leaguesErr;

  for (const league of leagues) {
    const { data: clubs, error } = await supabase
      .from('clubs')
      .select('external_team_id, name, short_name, short_code')
      .eq('league_id', league.id)
      .order('name');
    if (error) throw error;

    console.log(`\n=== ${league.slug} (${clubs.length} clubs) ===`);
    for (const c of clubs) {
      console.log(`${c.external_team_id}\t${c.name}\t${c.short_name}\t${c.short_code}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
