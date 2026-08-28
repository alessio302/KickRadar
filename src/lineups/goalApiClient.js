// Thin adapter around GOAL API's REST + WebSocket surface. Replaces
// Highlightly for lineup confirmation and match events (goals/cards/
// substitutions) -- confirmed live (see this project's diagnostic history)
// that GOAL API's FREE tier gives a real 1000 req/day limit (10x
// Highlightly's 100/day) and correct, complete event/card/substitution/
// lineup data, checked against a real 5-1 result down to the own goal and
// every substitution. Also the only one of the two with any live-push
// story: FREE allows 1 concurrent WebSocket connection subscribed to up
// to 25 matches (confirmed live via auth_success's own feature flags,
// despite the docs page's own endpoint table separately claiming 0 for
// FREE -- that table is wrong, trust the live response).
const BASE_URL = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';
export const GOAL_API_WS_URL = 'wss://api.goal-api.com/ws';

async function call(path, params = {}) {
  const apiKey = process.env.GOAL_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GOAL_API_KEY env var.');
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`GOAL API request failed: ${res.status} ${res.statusText} ${body}`);
  }
  return JSON.parse(body);
}

// One call per (league, date) -- fixtures for every match that league
// plays on that date. Matched against our own club rows by team name via
// clubMatch.js's resolveClub(), same as the rest of this project does for
// every external provider's own naming.
export async function getLeagueFixtures(leagueId, date) {
  const data = await call(`/leagues/${leagueId}/fixtures`, { date });
  return data.data ?? [];
}

// { data: { home: { startingLineups, substitutes, coach, missingPlayers },
// away: { ...same shape... }, homeFormation, awayFormation, hasLineups } } --
// confirmed live. Each lineup entry is a flat row (lineupPlayer,
// lineupNumber, lineupPosition, playerPosition, ...), not pre-grouped by
// formation line the way Highlightly's initialLineup was -- see
// buildLineupPlayers() in syncLineups.js for the transform.
export async function getFixtureLineups(fixtureId) {
  const data = await call(`/fixtures/${fixtureId}/lineups`);
  return data.data ?? null;
}

// Goals only -- confirmed live the "grouped.cards"/"grouped.substitutions"
// keys in this same response are always empty placeholders, despite
// existing in the shape. Cards and substitutions each need their own call
// below; there's no single request that returns all three.
export async function getFixtureEvents(fixtureId) {
  const data = await call(`/fixtures/${fixtureId}/events`);
  return data.data ?? [];
}

export async function getFixtureCards(fixtureId) {
  const data = await call(`/fixtures/${fixtureId}/cards`);
  return data.data ?? [];
}

export async function getFixtureSubstitutions(fixtureId) {
  const data = await call(`/fixtures/${fixtureId}/substitutions`);
  return data.data ?? [];
}

// Exchanges the API key for a short-lived (60s), single-use WebSocket
// connection token -- required for browser-style clients per GOAL API's
// own docs; a server-side Node client could send the API key directly on
// the socket handshake instead, but going through the token keeps this
// client symmetric with how a future browser consumer would have to do it,
// and costs nothing extra (one REST call per WS session, not per message).
export async function getWsToken() {
  const apiKey = process.env.GOAL_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GOAL_API_KEY env var.');
  }
  const res = await fetch(`${BASE_URL}/ws/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`GOAL API ws/token request failed: ${res.status} ${res.statusText} ${body}`);
  }
  const { data } = JSON.parse(body);
  return data; // { token, expiresIn }
}
