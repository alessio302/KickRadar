import { normalize } from '../util/normalize.js';
import { getSupabaseClient } from '../db/supabaseClient.js';

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

// Confirmed live this account sits on GOAL API's FREE plan (1,000
// requests/day) -- until this, nothing tracked actual usage against that
// anywhere, so knowing how much budget a given day's jobs had already
// spent meant reading cron schedules and counting clubs/players by hand.
// One row per day (goal_api_usage, see sql/041), incremented once per raw
// HTTP attempt here -- including retries, since a 429 still counts against
// GOAL API's own window, not just a successful response -- so this stays
// the single place every Node-side caller's usage gets recorded, same as
// this file's own retry logic already is. Best-effort: a failure to
// record must never be why a real GOAL API call fails, so this only logs.
async function recordUsage() {
  try {
    const { error } = await getSupabaseClient().rpc('increment_goal_api_usage');
    if (error) console.error('Failed to record GOAL API usage:', error.message);
  } catch (err) {
    console.error('Failed to record GOAL API usage:', err.message);
  }
}

// Confirmed live (2026-09-16): goal_api_usage.request_count hit 2955 for a
// single day -- nearly 3x the documented 1,000/day FREE-plan cap -- because
// nothing anywhere checked this table before spending more budget. Once
// the real cap is exhausted, every subsequent call() here 429s, RETRIES
// (still counted by recordUsage() above -- a 429 costs budget same as a
// success), and 429s again, digging the day deeper past the limit on every
// single attempt instead of just failing once. Meanwhile the calling job
// (confirmed live: syncLiveEvents.js) kept running its full ~14-minute
// self-loop on its normal 15-min schedule regardless, accomplishing
// nothing every single tick with no visible signal that anything was
// wrong -- from the user's side this looked identical to "live events
// silently stopped working," not "the daily quota is spent." Callers that
// do real, avoidable-if-exhausted work (a whole WS session, a resolve-then-
// subscribe batch) should check this FIRST and skip the entire run with a
// clear log line instead of finding out via a wave of 429s partway through.
// 950 (not 1000) leaves a small buffer for whatever's still mid-flight
// elsewhere sharing this same key when the check runs.
const DAILY_BUDGET_SAFETY_MARGIN = 50;
const DOCUMENTED_DAILY_LIMIT = 1000;

export async function hasGoalApiBudgetRemaining() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await getSupabaseClient().from('goal_api_usage').select('request_count').eq('day', today).maybeSingle();
  if (error) {
    console.error('Failed to read GOAL API usage, proceeding optimistically:', error.message);
    return true; // never let a usage-check failure be the reason real work doesn't happen
  }
  const used = data?.request_count ?? 0;
  return used < DOCUMENTED_DAILY_LIMIT - DAILY_BUDGET_SAFETY_MARGIN;
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
    await recordUsage();
    const body = await res.text();
    if (res.ok) return JSON.parse(body);

    const isRetryable = res.status === 429 || res.status === 502;
    const isLastAttempt = attempt === RETRY_BACKOFFS_MS.length;
    if (!isRetryable || isLastAttempt) {
      const err = new Error(`GOAL API request failed: ${res.status} ${res.statusText} ${body}`);
      err.status = res.status; // lets callers distinguish a real "not found" from a genuine failure
      throw err;
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
//
// Confirmed live (2026-09-18, diagnoseGoalApiFixturesRaw.js): this
// endpoint's `date` query param is silently ignored -- a call with
// date=2026-09-18 and one with no date at all return byte-identical
// responses (same page, sorted by matchRound descending, i.e. the
// season's LAST round first). The fixture object's own date field is
// called `matchDate`, but passing that as the query param instead makes
// no difference either -- still ignored. Kept as-is for now (every
// existing caller below still passes `date` and gets back the same
// broken, unfiltered response it always has) since this file's own
// resolveGoalApiIds() switched to getLiveLeagueFixtures() below instead
// of trying to fix date-filtering here; the other callers of this
// function (syncEuropeanFixtures.js, syncLineups.js,
// syncEuropeanLineups.js, syncEuropeanLiveScores.js,
// backfillEuropeanLineup.js) haven't been individually re-verified yet
// and are out of scope for that specific fix.
export async function getLeagueFixtures(leagueId, date) {
  const data = await call(`/leagues/${leagueId}/fixtures`, { date });
  return data.data ?? [];
}

// `status` IS a real, working filter on this same endpoint (confirmed live
// alongside the `date` finding above: status=LIVE correctly narrowed a
// 1909-total response down to exactly the one fixture actually live at
// request time) -- unlike `date`, which never filters anything. No date
// param needed here at all: there are only ever a handful of
// simultaneously-live matches league-wide, so status=LIVE alone is
// enough to find the fixture syncLiveEvents.js's resolveGoalApiIds()
// is looking for once it actually has gone live in GOAL API's own system.
export async function getLiveLeagueFixtures(leagueId) {
  const data = await call(`/leagues/${leagueId}/fixtures`, { status: 'LIVE' });
  return data.data ?? [];
}

// Confirmed live (2026-09-18): the ~50min-late lineup-confirmed push bug
// had the same root cause as the live_minute bug above -- syncLineups.js/
// syncEuropeanLineups.js still called the broken getLeagueFixtures(id,
// date) to resolve a SCHEDULED (pre-kickoff) fixture's goal_api_id, which
// (per that function's own comment) never actually filters by date, so a
// fixture in its near-kickoff window almost never showed up in whatever
// fixed page came back. goal_api_id only ended up resolved once
// syncLiveEvents.js's own (already-fixed) getLiveLeagueFixtures() caught
// the match after kickoff and cached it -- explaining the observed delay
// (a lineup push landing near half-time instead of near kickoff).
//
// status IS a real filter (see getLiveLeagueFixtures() above), so this
// finds a fixture by its real matchDate the only way that's actually
// possible: fetch each relevant status bucket and filter client-side.
// SCHEDULED is paginated (bounded at MAX_SCHEDULED_PAGES*100 -- confirmed
// live a full domestic league's remaining-season SCHEDULED count is in
// the low hundreds, so this comfortably covers it) because the near-
// kickoff round is the LOWEST remaining round number, and the endpoint
// sorts SCHEDULED descending by round (highest/most-future first) --
// exactly the one status where the target fixture is likely deep in the
// list, not on page 1. LIVE and FINISHED aren't paginated: LIVE is always
// tiny (a handful of matches league-wide at once), and FINISHED already
// returns its most-recently-completed matches first (confirmed live), so
// anything within this file's own near-kickoff lookback window is already
// on page 1.
const MAX_SCHEDULED_PAGES = 6;
const FIXTURES_PAGE_SIZE = 100;

export async function findLeagueFixturesByDate(leagueId, matchDate) {
  const found = [];

  const live = await call(`/leagues/${leagueId}/fixtures`, { status: 'LIVE' });
  found.push(...(live.data ?? []).filter((m) => m.matchDate === matchDate));

  const finished = await call(`/leagues/${leagueId}/fixtures`, { status: 'FINISHED' });
  found.push(...(finished.data ?? []).filter((m) => m.matchDate === matchDate));

  let offset = 0;
  for (let page = 0; page < MAX_SCHEDULED_PAGES; page++) {
    const scheduled = await call(`/leagues/${leagueId}/fixtures`, { status: 'SCHEDULED', limit: FIXTURES_PAGE_SIZE, offset });
    const items = scheduled.data ?? [];
    found.push(...items.filter((m) => m.matchDate === matchDate));
    if (!scheduled.pagination?.hasMore || items.length === 0) break;
    offset += items.length;
  }

  return found;
}

// For a caller that needs fixtures across a whole DATE RANGE (not just one
// date) -- syncEuropeanFixtures.js's own per-date loop used to call
// getLeagueFixtures(id, date) once per date in its ±N-day window (up to 67
// calls for a full sync), which (per that function's own comment) never
// actually filtered by date at all, so almost every one of those calls
// just re-fetched the same broken unfiltered page. Fetches each relevant
// status bucket ONCE for the whole competition instead -- LIVE (always
// tiny), FINISHED (paginated a couple pages; already sorted most-recent-
// first, confirmed live), SCHEDULED (paginated, same rationale as
// findLeagueFixturesByDate() above) -- and returns the merged raw list for
// the caller to group by its own `matchDate` field locally. Bounded pages
// are a caller-provided ceiling, not a guess: a UEFA league-phase
// competition's whole remaining season comfortably fits well under the
// defaults below (confirmed live: a single domestic league's remaining
// season SCHEDULED count sits in the low hundreds; UEFA's 36-team league
// phase is smaller still).
export async function getAllLeagueFixtures(leagueId, { maxFinishedPages = 2, maxScheduledPages = MAX_SCHEDULED_PAGES } = {}) {
  const all = [];

  const live = await call(`/leagues/${leagueId}/fixtures`, { status: 'LIVE' });
  all.push(...(live.data ?? []));

  let offset = 0;
  for (let page = 0; page < maxFinishedPages; page++) {
    const finished = await call(`/leagues/${leagueId}/fixtures`, { status: 'FINISHED', limit: FIXTURES_PAGE_SIZE, offset });
    const items = finished.data ?? [];
    all.push(...items);
    if (!finished.pagination?.hasMore || items.length === 0) break;
    offset += items.length;
  }

  offset = 0;
  for (let page = 0; page < maxScheduledPages; page++) {
    const scheduled = await call(`/leagues/${leagueId}/fixtures`, { status: 'SCHEDULED', limit: FIXTURES_PAGE_SIZE, offset });
    const items = scheduled.data ?? [];
    all.push(...items);
    if (!scheduled.pagination?.hasMore || items.length === 0) break;
    offset += items.length;
  }

  return all;
}

// Every team GOAL API has ever tracked for this league (confirmed live:
// Serie A returns 40 for a 20-club top flight -- includes past
// seasons'/inactive clubs, not just this season's 20; callers filter by
// name match against their own current roster rather than trusting the
// count). Each entry already carries id, name, badge, founded, and full
// venue detail -- one call resolves every club's GOAL API id at once,
// rather than needing to sample fixture dates across a season to
// eventually see each club as home or away.
//
// Paginated (confirmed live, diagnoseHeadToHeadPagination.js, since
// removed): the endpoint silently caps an unpaginated call at exactly 50
// results, and for a UEFA competition (81 teams tracked -- every
// qualifying-round entrant, not just the current league-phase 36) that cut
// off mid-alphabet-ish ordering, dropping current league-phase giants like
// Real Madrid/Bayern/PSG entirely while keeping every eliminated qualifier.
// Domestic leagues (well under 50) never actually needed this, but paging
// unconditionally means this function always returns the true complete
// set rather than silently depending on staying under an undocumented
// cap. limit=100 is the endpoint's own documented max (confirmed live: 200
// -> 400 "Limit must be between 1 and 100"). Capped at 5 pages (500 teams)
// as a runaway guard, well beyond any real competition's roster.
const MAX_TEAM_PAGES = 5;

export async function getLeagueTeams(leagueId) {
  const teams = [];
  let offset = 0;
  for (let page = 0; page < MAX_TEAM_PAGES; page++) {
    const data = await call(`/leagues/${leagueId}/teams`, { limit: 100, offset });
    const pageTeams = data.data ?? [];
    teams.push(...pageTeams);
    if (!data.pagination?.hasMore || pageTeams.length === 0) break;
    offset += pageTeams.length;
  }
  return teams;
}

// Full current squad for one team -- id, name, image, number, position
// (type), age, birthdate, injured, isCaptain, plus a season stats
// snapshot per player (same fields as getPlayer(), just without a
// separate call per squad member).
export async function getTeamSquad(teamId) {
  const data = await call(`/teams/${teamId}/players`);
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
//
// normalize()'s NFD strip only catches a "base letter + combining accent"
// pair (é -> e + ́) -- confirmed live it leaves genuinely distinct
// Latin letters like ø untouched (no NFD decomposition exists for them),
// so "Martin Ødegaard" still 400'd with the same "invalid characters"
// error even through normalize(). Folded separately here, scoped to just
// this outgoing search query -- not widened into normalize() itself,
// which also drives the DB's own normalized_name column elsewhere and
// shouldn't change behavior there without a wider audit.
const NON_NFD_LATIN_FOLD = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', đ: 'd', ð: 'd', þ: 'th', ł: 'l' };

function foldForGoalApiSearch(name) {
  return normalize(name).replace(/[øæœßđðþł]/g, (ch) => NON_NFD_LATIN_FOLD[ch] ?? ch);
}

export async function searchPlayers(name) {
  const data = await call('/players', { search: foldForGoalApiSearch(name) });
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

// Up to the last several seasons' meetings between two teams -- confirmed
// live (diagnoseHeadToHeadEndpoints.js/diagnoseHeadToHeadShape.js, both
// since removed) this is a real, working GOAL API endpoint despite an
// earlier diagnostic guessing 4 wrong REST shapes and concluding it didn't
// exist. team1Id/team2Id are GOAL API's own team ids (the same cuid
// getLeagueTeams() returns), not our DB's club_id or any external
// football-data.org id. Each match entry's shape (confirmed live):
// { match_id, match_date ("YYYY-MM-DD"), match_time, match_status,
//   match_hometeam_id, match_awayteam_id, match_hometeam_name,
//   match_awayteam_name, match_hometeam_score, match_awayteam_score (all
//   scores as strings), team_home_badge, team_away_badge, ... }. Order is
// not guaranteed most-recent-first by the API itself (unconfirmed) --
// callers sort by match_date before trusting the order.
//
// A 404 here (confirmed live, syncEuropeanHeadToHead.js's first real run)
// is a legitimate "these two teams have never met" answer, not a failure
// -- two teams drawn together for the first time in a UEFA competition's
// group/league phase is the normal case, not the exception. Caught here
// and turned into an empty result so one never-met pairing doesn't abort
// an entire sync run's remaining candidates.
export async function getHeadToHeadDirect(team1Id, team2Id) {
  try {
    const data = await call(`/h2h/${team1Id}/${team2Id}/direct`);
    return data.matches ?? [];
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
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
  await recordUsage();
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`GOAL API ws/token request failed: ${res.status} ${res.statusText} ${body}`);
  }
  const { data } = JSON.parse(body);
  return data; // { token, expiresIn }
}
