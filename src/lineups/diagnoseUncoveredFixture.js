import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getMatches } from './highlightlyClient.js';
import { resolveClub } from '../news/clubMatch.js';

const HIGHLIGHTLY_LEAGUE_NAME = {
  'serie-a': 'Serie A',
  bundesliga: 'Bundesliga',
  'premier-league': 'Premier League',
  'ligue-1': 'Ligue 1',
  'la-liga': 'La Liga',
};

// Read-only: fixture 361 was one of the 9 finished fixtures with zero
// lineup coverage. Is that because it never resolved a Highlightly match
// at all (a club-name matching miss -- fixable), or because Highlightly
// simply doesn't have lineup data for this particular match (a real
// upstream data gap -- not fixable on our side)?
async function run() {
  const supabase = getSupabaseClient();
  const fixtureId = 361;

  const { data: f, error } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at')
    .eq('id', fixtureId)
    .single();
  if (error) throw error;
  console.log('fixture:', JSON.stringify(f));

  const { data: dbLeagues } = await supabase.from('leagues').select('id, slug');
  const leagueSlug = dbLeagues.find((l) => l.id === f.league_id)?.slug;
  const league = LEAGUES.find((l) => l.slug === leagueSlug);
  console.log('league:', leagueSlug, league?.country);

  const { data: allClubs } = await supabase.from('clubs').select('id, name, aliases, league_id');
  const homeClub = allClubs.find((c) => c.id === f.home_club_id);
  const awayClub = allClubs.find((c) => c.id === f.away_club_id);
  console.log('home club:', homeClub?.name, 'away club:', awayClub?.name);

  const dateStr = new Date(f.kickoff_at).toISOString().slice(0, 10);
  const data = await getMatches({ date: dateStr, countryName: league.country });
  const all = Array.isArray(data) ? data : data.data || data.matches || [];
  const leagueMatches = all.filter((m) => m.league?.name === HIGHLIGHTLY_LEAGUE_NAME[leagueSlug]);
  console.log(`\nHighlightly matches for ${league.country} on ${dateStr}, league="${HIGHLIGHTLY_LEAGUE_NAME[leagueSlug]}": ${leagueMatches.length}`);
  for (const m of leagueMatches) {
    console.log(`  id=${m.id} ${m.homeTeam?.name} vs ${m.awayTeam?.name}`);
  }

  const leagueClubs = allClubs.filter((c) => c.league_id === f.league_id);
  const match = leagueMatches.find((m) => {
    const homeMatch = resolveClub(m.homeTeam?.name, leagueClubs)?.id === homeClub.id;
    const awayMatch = resolveClub(m.awayTeam?.name, leagueClubs)?.id === awayClub.id;
    return homeMatch && awayMatch;
  });
  console.log('\nresolved match:', match ? `id=${match.id}` : 'NONE -- club-name matching failed');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('diagnostic failed:', err);
    process.exit(1);
  });
