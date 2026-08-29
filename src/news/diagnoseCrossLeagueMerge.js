import { getSupabaseClient } from '../db/supabaseClient.js';

// Throwaway diagnostic: diagnosePremierLeagueGap.js (now removed) showed
// Barcola/Alvarez/Endrick/Enzo Fernandez all pass relevance+extraction+
// club-match+league-gate cleanly on replay, yet none show as a recent
// premier-league transfers row. Hypothesis: the cross-league duplicate
// check in scrapeLeague() queries `transfers` globally (not scoped to the
// scraping league), so whichever league's scraper saw a cross-league
// story FIRST inserts it under its own league_id -- a later scraper
// (skysports here) then just MERGES into that existing row (which
// doesn't touch league_id or created_at), so the story never appears
// under premier-league even though skysports genuinely reported it too.
// Read-only, no writes.
async function main() {
  const supabase = getSupabaseClient();
  const names = ['Barcola', 'Alvarez', 'Endrick', 'Fernandez'];

  for (const name of names) {
    const { data, error } = await supabase
      .from('transfers')
      .select('player_name, from_club, to_club, source, published_at, created_at, leagues(slug)')
      .ilike('player_name', `%${name}%`)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    console.log(`\n=== "${name}" ===`);
    console.log(JSON.stringify(data, null, 2));
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
