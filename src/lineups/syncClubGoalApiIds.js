// Resolves each club to GOAL API's own team id (needed by the
// get-team-squad Edge Function to fetch a club's live squad on demand),
// plus backfills founded year and venue capacity while already fetching
// this data -- one call per league via getLeagueTeams(), matched against
// our own clubs by name via resolveClub(), same pattern every other
// external provider id on this table already uses.
//
// Low-frequency by design (weekly cron): a club's GOAL API id, founding
// year, and venue capacity essentially never change mid-season -- the
// only real trigger for a re-run is a promoted/relegated club joining a
// league for the first time, which happens at most once a year.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { getLeagueTeams } from './goalApiClient.js';
import { resolveClub } from '../news/clubMatch.js';
import { LEAGUES } from '../config/leagues.js';

export async function syncClubGoalApiIds() {
  const supabase = getSupabaseClient();

  const { data: dbLeagues, error: leaguesErr } = await supabase.from('leagues').select('id, slug');
  if (leaguesErr) throw leaguesErr;
  const leagueIdBySlug = new Map(dbLeagues.map((l) => [l.slug, l.id]));

  let checked = 0;
  let resolved = 0;

  for (const league of LEAGUES) {
    const dbLeagueId = leagueIdBySlug.get(league.slug);
    if (!dbLeagueId) continue;

    const { data: clubs, error: clubsErr } = await supabase
      .from('clubs')
      .select('id, name, short_name, aliases')
      .eq('league_id', dbLeagueId);
    if (clubsErr) throw clubsErr;

    let teams;
    try {
      teams = await getLeagueTeams(league.goalApiLeagueId);
    } catch (err) {
      console.error(`GOAL API teams lookup failed for ${league.slug}:`, err.message);
      continue;
    }
    // Confirmed live: a league's team list includes past-season/inactive
    // clubs alongside this season's real roster (Serie A: 40 entries for a
    // 20-club top flight) -- restricting to isActive first keeps a stale
    // entry from ever winning a name match ahead of the real current club.
    const activeTeams = teams.filter((t) => t.isActive);

    // Standard direction (one external name vs. this league's own clubs,
    // same as resolveGoalApiIds()/syncLineups.js use for fixtures) rather
    // than checking each club against every team name -- resolveClub()'s
    // own best-match scoring then picks the closest club if a team name
    // could plausibly fit more than one.
    for (const team of activeTeams) {
      checked += 1;
      const club = resolveClub(team.name, clubs);
      if (!club) continue;

      const { error: updateErr } = await supabase
        .from('clubs')
        .update({
          goal_api_id: team.id,
          founded: team.founded ? Number(team.founded) : null,
          venue_capacity: team.venueCapacity ? Number(team.venueCapacity) : null,
        })
        .eq('id', club.id);
      if (updateErr) {
        console.error(`Update failed for club ${club.name}:`, updateErr.message);
        continue;
      }
      resolved += 1;
    }
  }

  return { checked, resolved };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncClubGoalApiIds()
    .then((result) => console.log('Club GOAL API id sync complete:', result))
    .catch((err) => {
      console.error('Club GOAL API id sync failed:', err);
      process.exitCode = 1;
    });
}
