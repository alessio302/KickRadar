import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getTeamSquad } from '../lineups/goalApiClient.js';

// goalApiClient.js's own sleep() is internal (not exported) -- unlike
// football-data.org's client.js, which does export one. This module needs
// its own pacing between squad calls, so it gets its own local copy.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Top N scorers per league to store (full season is ~38 matchdays,
// so keeping top 30-50 scorers per league is reasonable coverage)
const TOP_SCORERS_LIMIT = 50;

// Confirmed live: GOAL API's squad endpoint (/teams/{id}/players) returns
// full current squad with season stats per player (matchPlayed, goals, assists,
// ...) as top-level fields on each player -- see
// src/news/playerProfileResolver.js's extractStats(), which reads them the
// same way for the identical squad-entry shape.
//
// Iterates OUR OWN curated clubs (via clubs.goal_api_id) rather than
// getLeagueTeams(): confirmed live (a corrupted first backfill run) that
// getLeagueTeams() returns up to ~40 entries for a 20-club league --
// "includes past seasons'/inactive clubs" per goalApiClient.js's own
// comment -- and some of those duplicate the SAME team.id as the current
// club multiple times. That silently multiplied every current player's
// goals/assists by however many times their club's id repeated in that
// list (Julián Álvarez showed 10100 "goals"). clubs.goal_api_id already
// gives a clean one-row-per-real-club mapping -- syncPlayerProfiles.js
// uses the exact same source for the exact same reason.
export async function syncTopScorersForLeague(supabase, league) {
  const { data: dbLeague, error: leagueErr } = await supabase
    .from('leagues')
    .select('id')
    .eq('slug', league.slug)
    .single();
  if (leagueErr) throw leagueErr;

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, name, crest_url, goal_api_id')
    .eq('league_id', dbLeague.id)
    .not('goal_api_id', 'is', null);
  if (clubsErr) throw clubsErr;

  const scorers = [];

  for (const club of clubs) {
    let squad;
    try {
      squad = await getTeamSquad(club.goal_api_id);
    } catch (err) {
      console.error(`Squad fetch failed for ${club.name}:`, err.message);
      continue;
    }

    for (const player of squad) {
      scorers.push({
        player_name: player.name,
        club_id: club.id,
        club_name: club.name,
        club_badge: club.crest_url ?? null,
        goals: player.goals ?? 0,
        assists: player.assists ?? 0,
        matches: player.matchPlayed ?? 0,
      });
    }

    // Pace calls to stay well under GOAL API's 1000/day + 15-min-window budget
    await sleep(100);
  }

  // Sort by goals (then assists as tiebreaker) and take top N
  const sorted = scorers
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
