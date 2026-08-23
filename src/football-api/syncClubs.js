import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getTeams, getCurrentSeason } from './client.js';

// Derives a short badge code when API-Football doesn't provide `team.code`
// (it usually does, e.g. "JUV", "BVB"). Kept deterministic, no randomness.
function fallbackShortCode(name) {
  const words = name.replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export async function syncClubsForLeague(supabase, league, season) {
  const teams = await getTeams({ leagueId: league.apiFootballId, season });

  const { data: dbLeague, error: leagueErr } = await supabase
    .from('leagues')
    .select('id')
    .eq('slug', league.slug)
    .single();
  if (leagueErr) throw leagueErr;

  const rows = teams.map(({ team }) => ({
    league_id: dbLeague.id,
    name: team.name,
    short_code: (team.code || fallbackShortCode(team.name)).slice(0, 5),
    api_football_id: team.id,
  }));

  const { error } = await supabase
    .from('clubs')
    .upsert(rows, { onConflict: 'league_id,short_code' });
  if (error) throw error;

  return rows.length;
}

export async function syncAllClubs() {
  const supabase = getSupabaseClient();
  const season = getCurrentSeason();
  const results = {};
  for (const league of LEAGUES) {
    results[league.slug] = await syncClubsForLeague(supabase, league, season);
  }
  return results;
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncAllClubs()
    .then((results) => {
      console.log('Club sync complete:', results);
    })
    .catch((err) => {
      console.error('Club sync failed:', err);
      process.exitCode = 1;
    });
}
