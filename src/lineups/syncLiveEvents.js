// Live in-play events (goals/cards/substitutions) via GOAL API's WebSocket
// feed -- the primary path while a match is being played. The REST path in
// syncLineups.js (getFixtureEvents/getFixtureCards/getFixtureSubstitutions)
// stays as the safety net that runs once per fixture after it finishes and
// fully replaces whatever this file wrote (see its own comment on the
// delete-before-insert there): GOAL API's live match_update payload has no
// stable per-event id the way its REST endpoints do, so this file can only
// key rows by content, and that content-based key needs to be reconciled
// away rather than trusted forever.
//
// Deliberately never touches fixtures.status/home_score/away_score --
// syncLiveScores.js (football-data.org) already owns that, and having two
// writers race on the same columns from two different providers would be
// its own bug. This file only ever writes to match_events.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getLeagueFixtures, getWsToken, GOAL_API_WS_URL } from './goalApiClient.js';
import { resolveClub } from '../news/clubMatch.js';
import { notifyFavoritedFixtureEvents } from './matchEventNotifier.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Bounded below the workflow's own job timeout and below the outer
// schedule's cadence, same reasoning as syncLiveScores.js's JOB_BUDGET_MS --
// this file also holds one long-lived WS connection for the whole run,
// which needs to close cleanly before GitHub Actions would kill it.
const JOB_BUDGET_MS = 13 * 60 * 1000;

// How often to re-scan our own fixtures table for matches that have gone
// live (or are about to) since the run started, and subscribe to them over
// the already-open connection -- a match that kicks off mid-run shouldn't
// have to wait for the next scheduled job invocation.
const RESCAN_INTERVAL_MS = 60 * 1000;

// Same slack as syncLiveScores.js's UPCOMING_WINDOW_MS/RECENT_KICKOFF_WINDOW_MS:
// a scheduled fixture flips to 'live' sometime around kickoff_at, not
// exactly on it, so subscribing a little before and after catches it either
// way instead of missing the opening minutes.
const UPCOMING_WINDOW_MS = 10 * 60 * 1000;
const RECENT_KICKOFF_WINDOW_MS = 15 * 60 * 1000;

// GOAL API FREE plan's own confirmed limit (auth_success's maxSubscriptions,
// live-tested) -- capped here rather than trusting the caller never to
// exceed it, since going over would presumably just get the extra
// subscribe_response messages rejected.
const MAX_SUBSCRIPTIONS = 25;

// Brief pause before re-establishing a dropped connection -- confirmed
// live: GOAL API can close the socket within seconds of a successful
// auth+subscribe with zero match_update messages ever delivered and no
// error event, for no reason visible from this end. Reconnecting instantly
// in a tight loop would just hammer GOAL API's ws/token REST endpoint (a
// real call, not free) if whatever caused the drop is still true a moment
// later; a few seconds' backoff costs nothing against a 13-minute budget.
const RECONNECT_DELAY_MS = 5_000;

// Safety valve, not an expected ceiling -- a connection dropping and
// reconnecting a handful of times during a 13-minute run is normal GOAL
// API flakiness (see above); dozens of drops in a row would mean something
// more fundamental is broken (bad token minting, an outage on GOAL API's
// side), and at that point burning the rest of the run's budget on
// certain-to-fail reconnect attempts helps nobody -- better to exit and
// let the next scheduled run (or the watchdog) try fresh.
const MAX_RECONNECTS = 30;

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

async function findCandidateFixtures(supabase) {
  const now = new Date();
  const recently = new Date(now.getTime() - RECENT_KICKOFF_WINDOW_MS).toISOString();
  const soon = new Date(now.getTime() + UPCOMING_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at, status')
    .or(`status.eq.live,and(status.eq.scheduled,kickoff_at.gte.${recently},kickoff_at.lte.${soon})`);
  if (error) throw error;
  return data;
}

// Resolves each candidate's internal fixture id to GOAL API's own fixture id
// (a cuid, unrelated to our numeric id) -- same club-name matching approach
// as syncLineups.js, grouped by (league, date) so one GOAL API call covers
// every candidate in that league on that date instead of one call per fixture.
export async function resolveGoalApiIds(supabase, candidates) {
  if (candidates.length === 0) return new Map();

  const { data: dbLeagues, error: leaguesErr } = await supabase.from('leagues').select('id, slug');
  if (leaguesErr) throw leaguesErr;
  const leagueSlugById = new Map(dbLeagues.map((l) => [l.id, l.slug]));

  const { data: allClubs, error: clubsErr } = await supabase.from('clubs').select('id, name, short_name, aliases, league_id');
  if (clubsErr) throw clubsErr;
  const clubById = new Map(allClubs.map((c) => [c.id, c]));

  const groups = new Map();
  for (const f of candidates) {
    const leagueSlug = leagueSlugById.get(f.league_id);
    const league = LEAGUES.find((l) => l.slug === leagueSlug);
    if (!league) continue;
    const dateStr = toDateString(new Date(f.kickoff_at));
    const key = `${league.slug}|${dateStr}`;
    if (!groups.has(key)) groups.set(key, { league, dateStr, fixtures: [] });
    groups.get(key).fixtures.push(f);
  }

  const resolved = new Map(); // internal fixture id -> { goalApiId, homeClubId, awayClubId }
  for (const { league, dateStr, fixtures } of groups.values()) {
    let apiFixtures;
    try {
      apiFixtures = await getLeagueFixtures(league.goalApiLeagueId, dateStr);
    } catch (err) {
      console.error(`GOAL API fixtures failed for ${league.slug} ${dateStr}:`, err.message);
      continue;
    }
    const leagueClubs = allClubs.filter((c) => c.league_id === fixtures[0]?.league_id);

    for (const f of fixtures) {
      const homeClub = clubById.get(f.home_club_id);
      const awayClub = clubById.get(f.away_club_id);
      if (!homeClub || !awayClub) continue;
      const match = apiFixtures.find((m) => {
        const homeMatch = resolveClub(m.homeTeam?.name, leagueClubs)?.id === homeClub.id;
        const awayMatch = resolveClub(m.awayTeam?.name, leagueClubs)?.id === awayClub.id;
        return homeMatch && awayMatch;
      });
      if (!match) continue;
      resolved.set(f.id, { goalApiId: String(match.id), homeClubId: homeClub.id, awayClubId: awayClub.id, leagueSlug: league.slug });
    }
  }
  return resolved;
}

// GOAL API's own o.g. convention, confirmed live: an own goal's scorer name
// (with a "(o.g.)" suffix) appears under the field of the team that
// *benefited*, not the scorer's actual club -- same call made in
// syncLineups.js's buildEventRows for the REST path, kept consistent here.
function buildLiveEventRows(fixtureId, homeClubId, awayClubId, data) {
  const rows = [];

  for (const g of data.goalscorer ?? []) {
    const isHomeField = !!g.home_scorer;
    const rawName = isHomeField ? g.home_scorer : g.away_scorer;
    const scorerId = isHomeField ? g.home_scorer_id : g.away_scorer_id;
    const assist = isHomeField ? g.home_assist : g.away_assist;
    if (!rawName) continue;
    const isOwnGoal = /\(o\.g\.\)/i.test(rawName);
    rows.push({
      fixture_id: fixtureId,
      club_id: isHomeField ? homeClubId : awayClubId,
      type: isOwnGoal ? 'Own Goal' : 'Goal',
      minute: String(g.time ?? ''),
      player: rawName,
      assist: assist || null,
      substituted: null,
      event_key: `live-goal:${g.time}:${scorerId || rawName}:${g.score || ''}`,
    });
  }

  for (const c of data.cards ?? []) {
    const isHomeField = !!c.home_fault;
    const player = isHomeField ? c.home_fault : c.away_fault;
    const playerId = isHomeField ? c.home_player_id : c.away_player_id;
    if (!player) continue;
    const type = /red/i.test(c.card || '') ? 'Red Card' : 'Yellow Card';
    rows.push({
      fixture_id: fixtureId,
      club_id: isHomeField ? homeClubId : awayClubId,
      type,
      minute: String(c.time ?? ''),
      player,
      assist: null,
      substituted: null,
      event_key: `live-card:${c.time}:${playerId || player}:${type}`,
    });
  }

  const subs = data.substitutions ?? {};
  for (const side of ['home', 'away']) {
    for (const s of subs[side] ?? []) {
      const [outName, inName] = (s.substitution || '').split('|').map((p) => p.trim());
      const [outId, inId] = (s.substitution_player_id || '').split('|').map((p) => p.trim());
      if (!inName) continue;
      rows.push({
        fixture_id: fixtureId,
        club_id: side === 'home' ? homeClubId : awayClubId,
        type: 'Substitution',
        minute: String(s.time ?? ''),
        player: inName,
        assist: null,
        substituted: outName || null,
        event_key: `live-sub:${s.time}:${outId || outName}:${inId || inName}`,
      });
    }
  }

  return rows;
}

// Confirmed live: GOAL API's match_update carries no dedicated elapsed-
// minute field, but match_status doubles as one while a match is
// in-play -- a bare string like "23" or "45+2" (its match_time field stays
// fixed at kickoff time throughout, and the REST fixtures-by-date endpoint
// has no minute at all, only a text matchStatus like "LIVE"/"FINISHED").
// This mirrors GoalServe's well-known schema, which match_update's other
// field names (match_hometeam_name, goalscorer, ...) already match closely
// -- match_status holds the live minute as a plain number there too,
// switching to fixed text ("Half Time", "Finished", ...) outside play.
//
// "Half Time"/"HT" maps to the 'HT' sentinel rather than being left alone
// like every other fixed-text status -- confirmed live: leaving it alone
// (the original behavior here) meant fixtures.live_minute just kept
// whatever numeric value it last held before half-time, which the app then
// displayed as an actual live minute ("29'") long after kickoff, no
// different in appearance from a genuinely stuck sync. "Half Time" is the
// one fixed-text status worth surfacing explicitly, since it's a normal,
// expected phase of every match rather than a transient/edge state --
// other fixed-text values ("Finished", "Not Started", ...) stay ignored
// here, same conservative-match principle clubMatch.js's resolveClub()
// already applies: a wrong minute shown as live would be worse than the
// fixture row falling back to its kickoff time.
function parseLiveMinute(matchStatus) {
  if (typeof matchStatus !== 'string') return null;
  if (/^(half.?time|ht)$/i.test(matchStatus.trim())) return 'HT';
  return /^\d{1,3}(\+\d{1,2})?$/.test(matchStatus) ? matchStatus : null;
}

function countLiveEvents(data) {
  const subs = data.substitutions ?? {};
  return (data.goalscorer?.length ?? 0) + (data.cards?.length ?? 0) + (subs.home?.length ?? 0) + (subs.away?.length ?? 0);
}

// Holds one WebSocket connection open until either the run's overall
// deadline arrives (expected -- resolves reachedDeadline: true) or the
// connection closes for any other reason (GOAL API bouncing it, a network
// blip, an auth failure -- resolves reachedDeadline: false so the caller
// reconnects instead of treating the whole run as done). byGoalApiId,
// lastCounts and lastMinutes are the same Maps across every reconnect
// attempt within one run (mutated in place, never recreated here), so a
// fresh connection picks up exactly where a dropped one left off --
// already-known matches, minutes and event counts don't need rediscovering,
// and a reconnect's own auth_success re-subscribes to all of them in one
// go, same as the very first connection did.
async function connectAndTrack({ supabase, deadline, byGoalApiId, lastCounts, lastMinutes, counts }) {
  const { token } = await getWsToken();

  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WebSocket(`${GOAL_API_WS_URL}?wsToken=${token}`);
    } catch (err) {
      reject(err);
      return;
    }
    let settled = false;
    let rescanTimer = null;
    let deadlineTimer = null;

    const finish = (reachedDeadline) => {
      if (settled) return;
      settled = true;
      clearInterval(rescanTimer);
      clearTimeout(deadlineTimer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve(reachedDeadline);
    };

    deadlineTimer = setTimeout(() => finish(true), Math.max(deadline - Date.now(), 0));

    const subscribeTo = (goalApiId) => {
      ws.send(JSON.stringify({ type: 'subscribe', resource: 'match', matchId: goalApiId }));
    };

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token }));
    });

    ws.addEventListener('message', async (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === 'auth_success') {
        for (const goalApiId of byGoalApiId.keys()) subscribeTo(goalApiId);

        // Picks up fixtures that go live (or come into the kickoff window)
        // partway through this run, over the same connection -- GOAL API's
        // maxConnections:1 (FREE plan, confirmed live) means opening a
        // second one isn't an option, so new matches join this one instead.
        rescanTimer = setInterval(async () => {
          if (Date.now() >= deadline) return;
          try {
            const freshCandidates = await findCandidateFixtures(supabase);
            const freshResolved = await resolveGoalApiIds(supabase, freshCandidates);
            for (const [fixtureId, info] of freshResolved) {
              if (byGoalApiId.has(info.goalApiId) || byGoalApiId.size >= MAX_SUBSCRIPTIONS) continue;
              byGoalApiId.set(info.goalApiId, { fixtureId, homeClubId: info.homeClubId, awayClubId: info.awayClubId, leagueSlug: info.leagueSlug });
              subscribeTo(info.goalApiId);
            }
          } catch (err) {
            console.error('Live events rescan failed:', err.message);
          }
        }, RESCAN_INTERVAL_MS);
        return;
      }

      if (msg.type !== 'match_update') return;
      counts.updatesHandled += 1;

      const data = msg.data;
      const goalApiId = String(data?.id ?? '');
      const info = byGoalApiId.get(goalApiId);
      if (!info) return; // a match we're not tracking, or id shape we don't recognize

      const liveMinute = parseLiveMinute(data.match_status);
      if (liveMinute && lastMinutes.get(goalApiId) !== liveMinute) {
        lastMinutes.set(goalApiId, liveMinute);
        const { error: minuteErr } = await supabase.from('fixtures').update({ live_minute: liveMinute }).eq('id', info.fixtureId);
        if (minuteErr) console.error(`Failed to update live minute for fixture ${info.fixtureId}:`, minuteErr.message);
      }

      const count = countLiveEvents(data);
      if (lastCounts.get(goalApiId) === count) return; // no new goal/card/sub since last push
      lastCounts.set(goalApiId, count);

      const rows = buildLiveEventRows(info.fixtureId, info.homeClubId, info.awayClubId, data);
      if (rows.length === 0) return;

      const { error } = await supabase.from('match_events').upsert(rows, { onConflict: 'fixture_id,event_key' });
      if (error) {
        console.error(`Failed to store live events for fixture ${info.fixtureId}:`, error.message);
        return;
      }
      counts.rowsWritten += rows.length;

      try {
        await notifyFavoritedFixtureEvents(supabase, info.fixtureId, info.leagueSlug, rows);
      } catch (err) {
        console.error(`Failed to notify favorited-fixture events for fixture ${info.fixtureId}:`, err.message);
      }
    });

    ws.addEventListener('close', () => finish(false));
    ws.addEventListener('error', (event) => console.error('Live events WS error:', event.message ?? event));
  });
}

export async function syncLiveEvents() {
  const supabase = getSupabaseClient();
  const deadline = Date.now() + JOB_BUDGET_MS;

  const candidates = await findCandidateFixtures(supabase);
  if (candidates.length === 0) return { subscribed: 0, updatesHandled: 0, rowsWritten: 0, reconnects: 0 };

  const resolved = await resolveGoalApiIds(supabase, candidates);
  if (resolved.size === 0) return { subscribed: 0, updatesHandled: 0, rowsWritten: 0, reconnects: 0 };

  // goalApiId -> { fixtureId, homeClubId, awayClubId, leagueSlug }
  const byGoalApiId = new Map();
  for (const [fixtureId, info] of resolved) {
    if (byGoalApiId.size >= MAX_SUBSCRIPTIONS) break;
    byGoalApiId.set(info.goalApiId, { fixtureId, homeClubId: info.homeClubId, awayClubId: info.awayClubId, leagueSlug: info.leagueSlug });
  }

  const lastCounts = new Map(); // goalApiId -> last-seen total event count, to skip no-op writes
  const lastMinutes = new Map(); // goalApiId -> last-written live minute, to skip no-op writes
  const counts = { updatesHandled: 0, rowsWritten: 0 };
  let reconnects = 0;

  // Keeps reconnecting on an early/unexpected close until the deadline
  // itself is what ends the run -- see connectAndTrack()'s own comment for
  // why this exists. MAX_RECONNECTS is a safety valve against a
  // fundamentally broken connection (bad token, GOAL API outage) burning
  // the whole run on doomed retries, not an expected ceiling for normal
  // flakiness.
  while (Date.now() < deadline) {
    let reachedDeadline;
    try {
      reachedDeadline = await connectAndTrack({ supabase, deadline, byGoalApiId, lastCounts, lastMinutes, counts });
    } catch (err) {
      console.error('Live events connection attempt failed:', err.message);
      reachedDeadline = false;
    }
    if (reachedDeadline) break;

    reconnects += 1;
    if (reconnects >= MAX_RECONNECTS) {
      console.error(`Live events: hit MAX_RECONNECTS (${MAX_RECONNECTS}), giving up for this run.`);
      break;
    }
    if (Date.now() >= deadline) break;
    await sleep(RECONNECT_DELAY_MS);
  }

  return { subscribed: byGoalApiId.size, updatesHandled: counts.updatesHandled, rowsWritten: counts.rowsWritten, reconnects };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncLiveEvents()
    .then((result) => console.log('Live events sync complete:', result))
    .catch((err) => {
      console.error('Live events sync failed:', err);
      process.exitCode = 1;
    });
}
