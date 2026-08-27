import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getStandings, sleep } from './client.js';

export async function syncStandingsForLeague(supabase, league) {
  const { data: dbLeague, error: leagueErr } = await supabase
    .from('leagues')
    .select('id')
    .eq('slug', league.slug)
    .single();
  if (leagueErr) throw leagueErr;

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, external_team_id')
    .eq('league_id', dbLeague.id);
  if (clubsErr) throw clubsErr;
  const clubIdByExternalId = new Map(clubs.map((c) => [c.external_team_id, c.id]));

  const table = await getStandings({ competitionId: league.externalCompetitionId });

  const rows = table
    .filter((entry) => clubIdByExternalId.has(entry.team.id))
    .map((entry) => ({
      league_id: dbLeague.id,
      club_id: clubIdByExternalId.get(entry.team.id),
      position: entry.position,
      played: entry.playedGames,
      won: entry.won,
      draw: entry.draw,
      lost: entry.lost,
      points: entry.points,
      goals_for: entry.goalsFor,
      goals_against: entry.goalsAgainst,
      goal_difference: entry.goalDifference,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from('standings')
    .upsert(rows, { onConflict: 'league_id,club_id' });
  if (error) throw error;

  return rows.length;
}

export async function syncAllStandings() {
  const supabase = getSupabaseClient();
  const results = {};
  for (const league of LEAGUES) {
    results[league.slug] = await syncStandingsForLeague(supabase, league);
    await sleep(1500); // stay well under the free tier's 10 req/min
  }
  return results;
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncAllStandings()
    .then((results) => {
      console.log('Standings sync complete:', results);
    })
    .catch((err) => {
      console.error('Standings sync failed:', err);
      process.exitCode = 1;
    });
}
