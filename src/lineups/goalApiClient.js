import { normalize } from '../util/normalize.js';

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

// Confirmed live (src/news/playerProfileResolver.js's own investigation,
// then again here): GOAL API's short-term rate limit is an account-wide
// budget shared by every script polling this key (syncLineups.js,
// syncLiveEvents.js, playerProfileResolver.js all draw from the same
// GOAL_API_KEY), not something any one caller can pace on its own. Before
// this, a single 429/502 here threw straight up to the caller -- confirmed
// live for syncLiveEvents.js, a bare 429 on the very first fixtures lookup
// of a run meant `subscribed: 0` for that entire run, silently missing a
// real live match's events with no other chance to catch it until the next
// scheduled run 15+ minutes later. Retrying in this one shared call() means
// every endpoint in this file rides out a transient rate-limit hit instead
// of each caller needing its own copy of this logic.
//
// Confirmed live (2026-08-29, a full lineup-sync outage): the fixed 8s/16s
// backoffs below were guessing blind. The 429 response's own headers
// separate two independent budgets -- x-ratelimit-type: DAILY (1000/day,
// plenty of headroom left) and a much tighter one (ratelimit-policy:
// "1000;w=900", a 15-minute sliding window) that was fully saturated with
// retry-after: 110 -- more than 6x the fixed backoff's total wait, so
// every retry here was doomed before it started. retryDelayMs() below
// reads the server's own Retry-After when present instead of guessing;
// the fixed backoffs stay as a fallback for the rarer response that omits
// it. Capped at 60s so one slow endpoint can't eat a whole job's timeout
// budget -- a wait past that just fails this attempt and leaves it to the
// next scheduled run, same as full exhaustion already degrades.
const RETRY_BACKOFFS_MS = [8000, 16000];
const MAX_RETRY_WAIT_MS = 60000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(res, attempt) {
  const retryAfterSec = Number(res.headers.get('retry-after'));
  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return Math.min(retryAfterSec * 1000, MAX_RETRY_WAIT_MS);
  }
  return RETRY_BACKOFFS_MS[attempt];
}

async function call(path, params = {}) {
  const apiKey = process.env.GOAL_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GOAL_API_KEY env var.');
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  for (let attempt = 0; attempt <= RETRY_BACKOFFS_MS.length; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const body = await res.text();
    if (res.ok) return JSON.parse(body);

    const isRetryable = res.status === 429 || res.status === 502;
    const isLastAttempt = attempt === RETRY_BACKOFFS_MS.length;
    if (!isRetryable || isLastAttempt) {
      throw new Error(`GOAL API request failed: ${res.status} ${res.statusText} ${body}`);
    }

    const wait = retryDelayMs(res, attempt);
    console.warn(`GOAL API rate/gateway error on ${path}, retrying after ${wait}ms`);
    await sleep(wait);
  }
}

// One call per (league, date) -- fixtures for every match that league
// plays on that date. Matched against our own club rows by team name via
// clubMatch.js's resolveClub(), same as the rest of this project does for
// every external provider's own naming.
export async function getLeagueFixtures(leagueId, date) {
  const data = await call(`/leagues/${leagueId}/fixtures`, { date });
  return data.data ?? [];
}

// Match-specific highlight videos (GOAL API's own "Videos" resource) --
// used by syncHighlights.js to attach a highlights clip once a fixture
// finishes. matchId is GOAL API's own fixture id, same one
// resolveGoalApiIds()/getLeagueFixtures() already resolve elsewhere in
// this codebase -- not our internal numeric fixtures.id.
export async function getMatchVideos(matchId) {
  const data = await call(`/videos/match/${matchId}`);
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

// Global name search across every player GOAL API tracks (~1000 leagues
// worldwide, same collision risk as league name search -- see
// config/leagues.js's own comment on that) -- confirmed live it returns a
// real result set (id, name, image, age, birthdate, team{id,name,badge})
// per match, not just a bare id. src/news/playerProfileResolver.js
// disambiguates multiple hits against the club a transfer story already
// resolved, rather than guessing.
//
// Diacritics stripped before sending -- confirmed live via news-scraper
// run logs: GOAL API's own `search` param rejects any accented character
// outright with 400 "Search contains invalid characters" ("Julián Álvarez",
// "Joaquín Oso", ...), not something fixable by encoding on this end (the
// query string was already correctly percent-encoded). Extremely common in
// Spanish/French/Italian player names, so left unstripped this silently
// killed GOAL API resolution (photo/birthdate/stats) for a large share of
// LaLiga/Ligue 1 players, falling back to the transfermarkt.de scrape every
// time. GOAL API's own player records keep the real accented name (only
// the search query needed plain ASCII), so this doesn't lose match quality.
export async function searchPlayers(name) {
  const data = await call('/players', { search: normalize(name) });
  return data.data ?? [];
}

// Full profile for one player -- confirmed live this adds a real photo
// URL, birthdate, current team (with badge), and a season stats snapshot
// (goals/assists/cards/rating/minutes -- many other stat fields come back
// null depending on coverage) on top of what the search result above
// already has.
export async function getPlayer(goalApiId) {
  const data = await call(`/players/${goalApiId}`);
  return data.data ?? null;
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
