// Thin adapter around football-data.org's v4 API.
//
// Switched from API-Football: its free plan blocks the current season
// ("Free plans do not have access to this season, try from 2022 to 2024"),
// which makes it useless for tracking live fixtures. football-data.org's
// free tier (10 req/min) includes the current season for all four of our
// leagues, per the briefing's named fallback option.
const BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';

async function call(path, params = {}) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    throw new Error('Missing FOOTBALL_DATA_API_KEY env var.');
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    headers: { 'X-Auth-Token': apiKey },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`football-data.org request failed: ${res.status} ${res.statusText} ${body}`);
  }

  return res.json();
}

// Returns the current season's teams for a competition (football-data.org
// defaults to the current season when no `season` query param is given).
export async function getTeams({ competitionId }) {
  const data = await call(`/competitions/${competitionId}/teams`);
  return data.teams;
}

// `dateFrom`/`dateTo` are 'YYYY-MM-DD'.
export async function getMatches({ competitionId, dateFrom, dateTo }) {
  const data = await call(`/competitions/${competitionId}/matches`, { dateFrom, dateTo });
  return data.matches;
}

// The global (non-competition-scoped) /matches endpoint, not the
// per-competition one above -- accepts a comma-separated `competitions`
// list, so every tracked league's matches for one date come back in a
// SINGLE request instead of one per league. Confirmed live via
// diagnoseLiveMatches.js. Built for live-score polling (syncLiveScores.js),
// where request count matters most: the free tier's 10 req/min cap would
// otherwise limit how often a multi-league poll loop can run.
export async function getMatchesForDate({ competitionIds, date }) {
  const data = await call('/matches', { competitions: competitionIds.join(','), dateFrom: date, dateTo: date });
  return data.matches;
}

// TOTAL-only on the free tier -- confirmed live (diagnoseStandings.js, this
// session): the response's `standings` array has just one group
// (type: 'TOTAL', stage: 'REGULAR_SEASON'), no separate HOME/AWAY split,
// and every entry's own `form` field is always null despite being present
// in the response shape.
export async function getStandings({ competitionId }) {
  const data = await call(`/competitions/${competitionId}/standings`);
  return data.standings.find((s) => s.type === 'TOTAL')?.table ?? [];
}

// Reaches back across PAST SEASONS for free -- confirmed live
// (diagnoseHeadToHead.js, this session, since removed): Real Madrid vs
// Elche CF returned meetings back to the 2020-21 season. A per-MATCH
// endpoint (not per-competition like everything else in this file), so
// it's called once per fixture, not once per league -- see
// syncHeadToHead.js for the pacing/prioritization that needs given the
// free tier's 10 req/min cap once there are many fixtures to cover.
export async function getHeadToHead({ matchId, limit = 5 }) {
  const data = await call(`/matches/${matchId}/head2head`, { limit });
  return data.matches ?? [];
}

// Shared between syncFixtures.js (a few times a day) and syncLiveScores.js
// (every ~75s during a live window) so the two never drift apart on what a
// given football-data.org status actually means for us.
export const STATUS_MAP = {
  SCHEDULED: 'scheduled',
  TIMED: 'scheduled',
  IN_PLAY: 'live',
  PAUSED: 'live',
  FINISHED: 'finished',
  POSTPONED: 'postponed',
  SUSPENDED: 'postponed',
  CANCELLED: 'cancelled',
  AWARDED: 'finished',
};

// Free tier is capped at 10 requests/minute; a small delay between
// sequential per-league calls keeps a 4-league loop comfortably under that
// even though 4 requests alone wouldn't hit the limit.
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
