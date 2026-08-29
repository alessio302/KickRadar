import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getMatches } from '../football-api/client.js';
import { getLeagueFixtures } from './goalApiClient.js';
import { resolveClub } from '../news/clubMatch.js';

// Throwaway diagnostic for the "no lineups, no live events, wrong score"
// report on the live Liverpool vs Nottingham Forest fixture -- read-only,
// deleted once the finding is confirmed.
function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const supabase = getSupabaseClient();

  const { data: leagues, error: leaguesErr } = await supabase.from('leagues').select('id, slug');
  if (leaguesErr) throw leaguesErr;
  const plLeagueId = leagues.find((l) => l.slug === 'premier-league')?.id;
  console.log('premier-league id:', plLeagueId);

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, name, short_name, aliases, league_id')
    .eq('league_id', plLeagueId);
  if (clubsErr) throw clubsErr;

  const liverpool = clubs.find((c) => /liverpool/i.test(c.name));
  const forest = clubs.find((c) => /nottingham|forest/i.test(c.name));
  console.log('liverpool club row:', liverpool);
  console.log('forest club row:', forest);

  const { data: fixtures, error: fxErr } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at, status, home_score, away_score, updated_at, events_synced_at, external_fixture_id')
    .or(`home_club_id.eq.${liverpool?.id},away_club_id.eq.${liverpool?.id}`)
    .order('kickoff_at', { ascending: false })
    .limit(3);
  if (fxErr) throw fxErr;
  console.log('recent Liverpool fixture rows:', JSON.stringify(fixtures, null, 2));

  const fixture = fixtures?.[0];
  if (fixture) {
    const { data: lineups } = await supabase.from('lineups').select('*').eq('fixture_id', fixture.id);
    console.log('lineups rows for fixture:', JSON.stringify(lineups, null, 2));

    const { data: events } = await supabase.from('match_events').select('*').eq('fixture_id', fixture.id);
    console.log('match_events rows for fixture:', JSON.stringify(events, null, 2));
  }

  const today = toDateString(new Date());
  const league = LEAGUES.find((l) => l.slug === 'premier-league');

  try {
    const fdMatches = await getMatches({ competitionId: league.externalCompetitionId, dateFrom: today, dateTo: today });
    const fdMatch = fdMatches.find(
      (m) => /liverpool/i.test(m.homeTeam?.name || '') || /liverpool/i.test(m.awayTeam?.name || '')
    );
    console.log('football-data.org match for today:', JSON.stringify(fdMatch, null, 2));
    console.log('football-data.org total matches today:', fdMatches.length);
  } catch (err) {
    console.error('football-data.org getMatches failed:', err.message);
  }

  try {
    const goalFixtures = await getLeagueFixtures(league.goalApiLeagueId, today);
    console.log('GOAL API fixtures today count:', goalFixtures.length);
    const goalMatch = goalFixtures.find(
      (m) => /liverpool/i.test(m.homeTeam?.name || '') || /liverpool/i.test(m.awayTeam?.name || '')
    );
    console.log('GOAL API raw match:', JSON.stringify(goalMatch, null, 2));
    if (goalMatch) {
      const homeResolved = resolveClub(goalMatch.homeTeam?.name, clubs);
      const awayResolved = resolveClub(goalMatch.awayTeam?.name, clubs);
      console.log('resolveClub(home):', homeResolved?.id, homeResolved?.name);
      console.log('resolveClub(away):', awayResolved?.id, awayResolved?.name);
    }
  } catch (err) {
    console.error('GOAL API getLeagueFixtures failed:', err.message);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
