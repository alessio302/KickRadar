import { getSupabaseClient } from '../db/supabaseClient.js';
import { getLeagueTeams } from '../lineups/goalApiClient.js';
import { resolveClub } from '../news/clubMatch.js';
import { UEFA_COMPETITIONS } from '../config/leagues.js';

// Follow-up to the first real syncEuropeanHeadToHead.js run (PR #110),
// which failed to resolve most fixture team-name pairs against GOAL API's
// own /leagues/:id/teams list ("Bayer Leverkusen" vs "Celje",
// "Anderlecht" vs "Olympique Lyonnais", etc. -- all clubs that obviously
// exist in these competitions). Dumps our own distinct fixture team names
// per UEFA competition side by side with GOAL API's own team name list for
// that same competition, plus which of ours resolveClub() actually
// matched, to see the real naming mismatch instead of guessing at it.

async function main() {
  const supabase = getSupabaseClient();

  const { data: dbLeagues, error: leaguesErr } = await supabase
    .from('leagues')
    .select('id, slug')
    .in('slug', UEFA_COMPETITIONS.map((c) => c.slug));
  if (leaguesErr) throw leaguesErr;

  for (const comp of UEFA_COMPETITIONS) {
    const dbLeague = dbLeagues.find((l) => l.slug === comp.slug);
    if (!dbLeague) {
      console.log(`\n=== ${comp.name}: no leagues row, skipping ===`);
      continue;
    }
    console.log(`\n=== ${comp.name} (internal league_id ${dbLeague.id}, goalApiLeagueId ${comp.goalApiLeagueId}) ===`);

    const { data: fixtures, error: fixturesErr } = await supabase
      .from('fixtures')
      .select('home_team_name, away_team_name')
      .eq('league_id', dbLeague.id);
    if (fixturesErr) throw fixturesErr;
    const ourNames = [...new Set(fixtures.flatMap((f) => [f.home_team_name, f.away_team_name]).filter(Boolean))].sort();
    console.log(`Our distinct team names (${ourNames.length}):`, ourNames);

    const goalTeams = await getLeagueTeams(comp.goalApiLeagueId);
    console.log(`GOAL API team names (${goalTeams.length}):`, goalTeams.map((t) => t.name).sort());

    console.log('Resolution results:');
    for (const name of ourNames) {
      const match = resolveClub(name, goalTeams);
      console.log(`  "${name}" -> ${match ? `"${match.name}" (${match.id})` : 'NO MATCH'}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
