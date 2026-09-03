import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getLeagueTeams, getTeamSquad, sleep } from '../lineups/goalApiClient.js';

// Top N scorers per league to store (full season is ~38 matchdays,
// so keeping top 30-50 scorers per league is reasonable coverage)
const TOP_SCORERS_LIMIT = 50;

// Confirmed live: GOAL API's squad endpoint (/teams/{id}/players) returns
// full current squad with season stats per player (matchPlayed, goals, assists,
// ...) -- see src/news/playerProfileResolver.js's STAT_FIELDS for the full list.
// Goals/assists aggregation from match_events would only get completed fixtures,
// but squad stats are live-updating from the provider, so this is faster and
// more current.
export async function syncTopScorersForLeague(supabase, league) {
  const { data: dbLeague, error: leagueErr } = await supabase
    .from('leagues')
    .select('id')
    .eq('slug', league.slug)
    .single();
  if (leagueErr) throw leagueErr;

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, name, external_team_id')
    .eq('league_id', dbLeague.id);
  if (clubsErr) throw clubsErr;
  const clubsByExternalId = new Map(clubs.map((c) => [c.external_team_id, c]));

  // Fetch teams for this league once to get GOAL API team ids
  const teams = await getLeagueTeams(league.goalApiLeagueId);
  const scorersByPlayer = new Map(); // player_name -> { goals, assists, matches, club }

  // Fetch squad for each team and aggregate scorer stats
  for (const team of teams) {
    const squad = await getTeamSquad(team.id);
    for (const player of squad) {
      const key = `${player.name}|${team.id}`;
      if (!scorersByPlayer.has(key)) {
        const club = clubsByExternalId.get(team.id);
        scorersByPlayer.set(key, {
          player_name: player.name,
          club_id: club?.id ?? null,
          club_name: team.name,
          club_badge: team.badge,
          goals: 0,
          assists: 0,
          matches: 0,
        });
      }
      const entry = scorersByPlayer.get(key);
      entry.goals = (player.stats?.goals ?? 0) + entry.goals;
      entry.assists = (player.stats?.assists ?? 0) + entry.assists;
      entry.matches = (player.stats?.matchPlayed ?? 0) + entry.matches;
    }

    // Pace calls to stay under GOAL API's 1000/day budget
    // getLeagueTeams already took 1 call, then getTeamSquad per team
    // With 5 leagues × ~20 teams = ~100 calls, we have plenty of budget
    await sleep(100);
  }

  // Sort by goals (then assists as tiebreaker) and take top N
  const sorted = Array.from(scorersByPlayer.values())
    .sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals;
      return b.assists - a.assists;
    })
    .slice(0, TOP_SCORERS_LIMIT);

  // Build rows to upsert
  const rows = sorted.map((scorer, index) => ({
    league_id: dbLeague.id,
    player_name: scorer.player_name,
    club_id: scorer.club_id,
    club_name: scorer.club_name,
    club_badge: scorer.club_badge,
    goals: scorer.goals,
    assists: scorer.assists,
    matches_played: scorer.matches,
    rank: index + 1,
    updated_at: new Date().toISOString(),
  }));

  // Delete old top scorers for this league, then insert new ones
  const { error: deleteErr } = await supabase
    .from('top_scorers')
    .delete()
    .eq('league_id', dbLeague.id);
  if (deleteErr) throw deleteErr;

  if (rows.length > 0) {
    const { error: insertErr } = await supabase
      .from('top_scorers')
      .insert(rows);
    if (insertErr) throw insertErr;
  }

  return rows.length;
}

export async function syncAllTopScorers() {
  const supabase = getSupabaseClient();
  const results = {};
  for (const league of LEAGUES) {
    results[league.slug] = await syncTopScorersForLeague(supabase, league);
    await sleep(1500); // stay well under the free tier's 10 req/min for football-data.org
  }
  return results;
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncAllTopScorers()
    .then((results) => {
      console.log('Top scorers sync complete:', results);
    })
    .catch((err) => {
      console.error('Top scorers sync failed:', err);
      process.exitCode = 1;
    });
}
