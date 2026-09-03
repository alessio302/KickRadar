import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';

// Top N scorers per league to store.
const TOP_SCORERS_LIMIT = 50;

// A converted penalty is logged as its own 'Penalty' event, never also as
// a separate 'Goal' row for the same kick -- confirmed live (a Liverpool
// fixture: Szoboszlai's 90th-minute penalty appears once, type 'Penalty',
// no matching 'Goal' row) -- so both types are counted as goals with no
// double-counting risk. 'Own Goal' is deliberately excluded: it's never
// credited to the scorer in standard top-scorer charts.
const GOAL_EVENT_TYPES = ['Goal', 'Penalty'];

// Switched away from GOAL API's squad-embedded stats (player.goals/
// assists/matchPlayed on /teams/{id}/players) after confirming live that
// they're NOT current-season numbers: football-data.org's own standings
// showed every club at 1-3 matches played this season, while GOAL API's
// squad stats showed individual players with 10-33 matches played --
// consistent with last season's final tally, not this season's, and GOAL
// API's response carries no season identifier to tell the two apart (see
// playerProfileResolver.js's own comment on that same ambiguity).
//
// match_events has no such ambiguity: every row is tied to a fixture_id,
// and fixtures are only ever synced for the current season (syncFixtures.js
// omits date filters specifically to get the whole current season, no
// historical seasons ever enter that table) -- so aggregating goals/
// assists from match_events is provably current-season, not an inference.
//
// Trade-off: match_events' player/assist names come from GOAL API's match
// event feed in short form ("A. Elanga"), not the full names GOAL API's
// player-profile endpoint returns ("Anthony Elanga") -- cosmetic, but
// worth knowing if a name looks abbreviated.
export async function syncTopScorersForLeague(supabase, league) {
  const { data: dbLeague, error: leagueErr } = await supabase
    .from('leagues')
    .select('id')
    .eq('slug', league.slug)
    .single();
  if (leagueErr) throw leagueErr;

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, name, crest_url')
    .eq('league_id', dbLeague.id);
  if (clubsErr) throw clubsErr;
  const clubsById = new Map(clubs.map((c) => [c.id, c]));

  const { data: fixtures, error: fixturesErr } = await supabase
    .from('fixtures')
    .select('id')
    .eq('league_id', dbLeague.id);
  if (fixturesErr) throw fixturesErr;
  const fixtureIds = fixtures.map((f) => f.id);
  if (fixtureIds.length === 0) return 0;

  const { data: events, error: eventsErr } = await supabase
    .from('match_events')
    .select('type, player, assist, club_id, fixture_id')
    .in('fixture_id', fixtureIds);
  if (eventsErr) throw eventsErr;

  const scorersByKey = new Map(); // `${player}|${club_id}` -> { player_name, club_id, goals, assists, matchIds }

  function getEntry(playerName, clubId) {
    const key = `${playerName}|${clubId}`;
    if (!scorersByKey.has(key)) {
      scorersByKey.set(key, { player_name: playerName, club_id: clubId, goals: 0, assists: 0, matchIds: new Set() });
    }
    return scorersByKey.get(key);
  }

  // matches_played here is a best-effort proxy (distinct fixtures where
  // this player scored, assisted, was carded, or was substituted), not a
  // true appearance count -- a player who played a full unremarkable
  // match with none of those events wouldn't be counted for it. Goals and
  // assists themselves are exact, since every scoring/assisting event is
  // captured directly.
  for (const e of events) {
    if (e.player) {
      const entry = getEntry(e.player, e.club_id);
      entry.matchIds.add(e.fixture_id);
      if (GOAL_EVENT_TYPES.includes(e.type)) entry.goals += 1;
    }
    if (e.type === 'Goal' && e.assist) {
      const entry = getEntry(e.assist, e.club_id);
      entry.matchIds.add(e.fixture_id);
      entry.assists += 1;
    }
  }

  const sorted = Array.from(scorersByKey.values())
    .filter((s) => s.goals > 0 || s.assists > 0)
    .sort((a, b) => (b.goals !== a.goals ? b.goals - a.goals : b.assists - a.assists))
    .slice(0, TOP_SCORERS_LIMIT);

  const rows = sorted.map((s, index) => {
    const club = clubsById.get(s.club_id);
    return {
      league_id: dbLeague.id,
      player_name: s.player_name,
      club_id: s.club_id,
      club_name: club?.name ?? null,
      club_badge: club?.crest_url ?? null,
      goals: s.goals,
      assists: s.assists,
      matches_played: s.matchIds.size,
      rank: index + 1,
      updated_at: new Date().toISOString(),
    };
  });

  const { error: deleteErr } = await supabase.from('top_scorers').delete().eq('league_id', dbLeague.id);
  if (deleteErr) throw deleteErr;

  if (rows.length > 0) {
    const { error: insertErr } = await supabase.from('top_scorers').insert(rows);
    if (insertErr) throw insertErr;
  }

  return rows.length;
}

export async function syncAllTopScorers() {
  const supabase = getSupabaseClient();
  const results = {};
  for (const league of LEAGUES) {
    results[league.slug] = await syncTopScorersForLeague(supabase, league);
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
