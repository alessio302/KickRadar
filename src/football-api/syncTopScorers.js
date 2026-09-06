import { getSupabaseClient } from '../db/supabaseClient.js';
import { fetchAllRows } from '../db/fetchAllRows.js';
import { LEAGUES } from '../config/leagues.js';
import { normalize } from '../util/normalize.js';

// Top N scorers per league to store.
const TOP_SCORERS_LIMIT = 50;

// A converted penalty is logged as its own 'Penalty' event, never also as
// a separate 'Goal' row for the same kick -- confirmed live (a Liverpool
// fixture: Szoboszlai's 90th-minute penalty appears once, type 'Penalty',
// no matching 'Goal' row) -- so both types are counted as goals with no
// double-counting risk. 'Own Goal' is deliberately excluded: it's never
// credited to the scorer in standard top-scorer charts.
const GOAL_EVENT_TYPES = ['Goal', 'Penalty'];

// Lets a tap on a top-scorers row open the same PlayerProfileOverlay every
// other player-facing spot in the app does, and show a real photo instead
// of the club badge -- per explicit request. match_events' player names
// are abbreviated ("D. Malen"), not the full names `players.name` stores
// ("Donyell Malen"), so this can't be a straight FK/name join -- instead,
// within each row's own club (players.current_club_name matches clubs.name
// exactly, confirmed live for every club currently tracked), it looks for
// a SINGLE player whose own last name-token matches the event name's last
// token after diacritics/case normalization ("K. Mbappe" -> "mbappe"
// matches "Kylian Mbappé" -> normalized last token "mbappe"). Ambiguous
// (0 or 2+ matches) is left unresolved on purpose: the row's player_id/
// photo_url/goal_api_id stay null, and the frontend simply doesn't make
// that row tappable rather than guessing wrong.
async function resolvePlayerLinks(supabase, rows) {
  const clubNames = [...new Set(rows.map((r) => r.club_name).filter(Boolean))];
  if (clubNames.length === 0) return;

  const { data: candidates, error } = await supabase
    .from('players')
    .select('id, name, photo_url, goal_api_id, current_club_name')
    .in('current_club_name', clubNames);
  if (error) throw error;

  const candidatesByClub = new Map();
  for (const p of candidates ?? []) {
    if (!candidatesByClub.has(p.current_club_name)) candidatesByClub.set(p.current_club_name, []);
    candidatesByClub.get(p.current_club_name).push(p);
  }

  const lastToken = (name) => {
    const parts = normalize(name).trim().split(/\s+/);
    return parts[parts.length - 1];
  };

  for (const row of rows) {
    const pool = candidatesByClub.get(row.club_name) ?? [];
    const target = lastToken(row.player_name);
    const matches = pool.filter((p) => lastToken(p.name) === target);
    if (matches.length === 1) {
      row.player_id = matches[0].id;
      row.photo_url = matches[0].photo_url ?? null;
      row.goal_api_id = matches[0].goal_api_id ?? null;
    }
  }
}

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

  // fetchAllRows(), not a plain .select() -- a full season easily passes
  // PostgREST's default 1000-row response cap per league (confirmed live
  // 2026-09-06 elsewhere in this codebase: an unpaginated `players` fetch
  // silently returned barely a quarter of that table once it grew past
  // 1000 rows, no error, just fewer rows). Early-season event counts here
  // are still under 1000 per league, but a 38-round season won't stay
  // there.
  const events = await fetchAllRows(supabase, 'match_events', 'type, player, assist, club_id, fixture_id', (q) =>
    q.in('fixture_id', fixtureIds)
  );

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

  await resolvePlayerLinks(supabase, rows);

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
