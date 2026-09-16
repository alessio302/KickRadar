import { getSupabaseClient } from '../db/supabaseClient.js';
import { fetchAllRows } from '../db/fetchAllRows.js';
import { LEAGUES } from '../config/leagues.js';
import { normalize } from '../util/normalize.js';

// Same goal/assist/card extraction guarantee syncTopScorers.js already
// established for the Top Scorers view: match_events rows are tied to a
// fixture_id, and fixtures are only ever synced for the current season
// (syncFixtures.js omits date filters specifically to get the whole
// current season, no historical seasons ever enter that table), so
// aggregating from match_events is provably current-season, not GOAL
// API's undated player.stats snapshot (see PlayerProfileOverlay.jsx's own
// former comment on that ambiguity, and README's "Known limitations"
// entry this replaces).
const GOAL_EVENT_TYPES = ['Goal', 'Penalty'];

function lastToken(name) {
  const parts = normalize(name).trim().split(/\s+/);
  return parts[parts.length - 1];
}

// match_events' player names are abbreviated ("L. Martinez"), but the
// leading initial survives abbreviation either way -- a full name's own
// first token starts with the same letter. Strips a trailing period so
// "L." and "Lautaro" both yield "l".
function firstInitial(name) {
  const token = normalize(name).trim().split(/\s+/)[0] ?? '';
  return token.replace(/\./g, '').charAt(0) || null;
}

// Groups candidates by last-name token -- NOT collapsed to one entry per
// token, unlike an earlier version of this file. Confirmed live
// (2026-09-16, Inter Milan's real squad: Lautaro Martinez the striker AND
// Josep Martinez the goalkeeper both currently on it): dropping both
// colliding players outright, rather than trying to tell them apart,
// meant NEITHER ever got a season_goals/assists row again -- permanently
// stuck at null from the very first run this collision existed, since
// there's no self-healing path back to a value once dropped. resolvePlayer()
// below now tries first-initial disambiguation before giving up, which
// correctly separates "L. Martinez" (Lautaro) from a hypothetical
// "J. Martinez" (Josep) event using exactly the information match_events
// already provides -- only a same-last-name-AND-same-first-initial
// collision (rare) still falls back to leaving the event uncredited.
function buildLastTokenIndex(players) {
  const map = new Map();
  for (const p of players) {
    const key = lastToken(p.name);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return map;
}

// Returns the single player this match_events name resolves to, or null
// if it's genuinely ambiguous (no candidate, or more than one candidate
// even after first-initial narrowing).
function resolvePlayer(lastTokenIndex, eventName) {
  const candidates = lastTokenIndex.get(lastToken(eventName));
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const initial = firstInitial(eventName);
  if (!initial) return null;
  const narrowed = candidates.filter((p) => firstInitial(p.name) === initial);
  return narrowed.length === 1 ? narrowed[0] : null;
}

export async function syncPlayerSeasonStatsForLeague(supabase, league) {
  const { data: dbLeague, error: leagueErr } = await supabase
    .from('leagues')
    .select('id')
    .eq('slug', league.slug)
    .single();
  if (leagueErr) throw leagueErr;

  const { data: clubs, error: clubsErr } = await supabase.from('clubs').select('id, name').eq('league_id', dbLeague.id);
  if (clubsErr) throw clubsErr;
  if (clubs.length === 0) return { candidates: 0, updated: 0 };

  const { data: fixtures, error: fixturesErr } = await supabase.from('fixtures').select('id').eq('league_id', dbLeague.id);
  if (fixturesErr) throw fixturesErr;
  const fixtureIds = fixtures.map((f) => f.id);
  if (fixtureIds.length === 0) return { candidates: 0, updated: 0 };

  // fetchAllRows(), not a plain .select() -- a full season easily passes
  // PostgREST's default 1000-row response cap per league (confirmed live
  // 2026-09-06 elsewhere in this codebase: an unpaginated `players` fetch
  // silently returned barely a quarter of that table once it grew past
  // 1000 rows, no error, just fewer rows). Early-season event counts here
  // are still under 1000 per league, but a 38-round season won't stay
  // there.
  const events = await fetchAllRows(supabase, 'match_events', 'type, player, assist, club_id', (q) => q.in('fixture_id', fixtureIds));

  const eventsByClub = new Map();
  for (const e of events) {
    if (!eventsByClub.has(e.club_id)) eventsByClub.set(e.club_id, []);
    eventsByClub.get(e.club_id).push(e);
  }

  const clubNames = clubs.map((c) => c.name);
  const players = await fetchAllRows(supabase, 'players', 'id, name, current_club_name', (q) => q.in('current_club_name', clubNames));

  const playersByClubName = new Map();
  for (const p of players) {
    if (!playersByClubName.has(p.current_club_name)) playersByClubName.set(p.current_club_name, []);
    playersByClubName.get(p.current_club_name).push(p);
  }

  const now = new Date().toISOString();
  let updated = 0;

  for (const club of clubs) {
    const candidates = playersByClubName.get(club.name) ?? [];
    if (candidates.length === 0) continue;

    const lastTokenIndex = buildLastTokenIndex(candidates);
    // Every current squad member starts at an explicit 0, not null -- a
    // player with genuinely no goals/assists/cards this season needs to
    // read as "0", the same verified fact as any other count, not as "no
    // data" (which stays reserved for an event resolvePlayer() itself
    // can't attribute to anyone).
    const counts = new Map();
    for (const p of candidates) counts.set(p.id, { goals: 0, assists: 0, yellowCards: 0, redCards: 0 });

    for (const e of eventsByClub.get(club.id) ?? []) {
      if (e.player) {
        const target = resolvePlayer(lastTokenIndex, e.player);
        const c = target && counts.get(target.id);
        if (c) {
          if (GOAL_EVENT_TYPES.includes(e.type)) c.goals += 1;
          else if (e.type === 'Yellow Card') c.yellowCards += 1;
          else if (e.type === 'Red Card') c.redCards += 1;
        }
      }
      if (e.type === 'Goal' && e.assist) {
        const target = resolvePlayer(lastTokenIndex, e.assist);
        const c = target && counts.get(target.id);
        if (c) c.assists += 1;
      }
    }

    for (const [playerId, c] of counts) {
      const { error } = await supabase
        .from('players')
        .update({
          season_goals: c.goals,
          season_assists: c.assists,
          season_yellow_cards: c.yellowCards,
          season_red_cards: c.redCards,
          season_stats_updated_at: now,
        })
        .eq('id', playerId);
      if (error) console.error(`Season stats update failed for player ${playerId}:`, error.message);
      else updated += 1;
    }
  }

  return { candidates: players.length, updated };
}

export async function syncAllPlayerSeasonStats() {
  const supabase = getSupabaseClient();
  const results = {};
  for (const league of LEAGUES) {
    results[league.slug] = await syncPlayerSeasonStatsForLeague(supabase, league);
  }
  return results;
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncAllPlayerSeasonStats()
    .then((results) => {
      console.log('Player season stats sync complete:', results);
    })
    .catch((err) => {
      console.error('Player season stats sync failed:', err);
      process.exitCode = 1;
    });
}
