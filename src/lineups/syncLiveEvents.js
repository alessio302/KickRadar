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
// Deliberately never touches DOMESTIC fixtures' status/home_score/
// away_score -- syncLiveScores.js (football-data.org) already owns that,
// and having two writers race on the same columns from two different
// providers would be its own bug. UEFA_COMPETITIONS fixtures are
// different: football-data.org's UCL match object has no live push, and
// the goal-api-webhook Edge Function only knows the 5 domestic leagues'
// club_id-keyed fixtures -- this connection is this file's real-time
// writer for status/score/live_minute for the three UEFA competitions.
// "Real-time", not "sole", as of syncEuropeanLiveScores.js: confirmed live
// 2026-09-10 that GOAL API's FREE-tier WS accepts a subscribe for every
// candidate match but doesn't reliably push match_update for all of them
// (3 of 4 simultaneously-live CL fixtures got zero WS messages that day,
// stuck on 'scheduled' for the rest of the match despite GOAL API's own
// REST snapshot already showing the correct live score). That file is a
// REST poll backstop for status/home_score/away_score alone -- this
// connection stays the only writer for live_minute and match_events,
// which have no REST equivalent to fall back to.
//
// One WS connection total, tracking BOTH domestic and European matches at
// once -- GOAL API's FREE plan caps maxConnections at 1 (confirmed live,
// see connectAndTrack()'s own comment), so a second, independently-
// scheduled job opening its own connection would fight this one for it
// rather than adding coverage. byGoalApiId's info shape now carries a
// `kind` ('domestic' | 'european') deciding both how to resolve/key a
// match (club_id vs team_name -- European fixtures have no clubs table
// row, see syncEuropeanFixtures.js's own comment) and whether this file
// writes status/score for it.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES, UEFA_COMPETITIONS } from '../config/leagues.js';
import { getLeagueFixtures, getWsToken, GOAL_API_WS_URL } from './goalApiClient.js';
import { resolveClub } from '../news/clubMatch.js';
import { namesLooselyMatch } from './syncEuropeanLineups.js';
import { notifyFavoritedFixtureEvents } from './matchEventNotifier.js';

// Same anti-regression guard syncFixtures.js/syncEuropeanFixtures.js/
// syncLiveScores.js already use everywhere else a fixture's status gets
// written from more than one place over time -- a live WS tick arriving
// out of order (or a stray unrecognized match_status string) must never
// walk a fixture backwards through scheduled -> live -> finished.
const STATUS_RANK = { scheduled: 0, postponed: 0, cancelled: 0, live: 1, finished: 2 };

// GOAL API's match_status field for a EUROPEAN fixture's live write --
// deriving scheduled/live/finished from it, not just the live-minute
// parsing parseLiveMinute() already does below. Two known shapes: a bare
// elapsed-minute string ("23", "45+2") or "Half Time"/"HT" while in play
// (confirmed live for the 5 domestic leagues, same match_status field --
// parseLiveMinute() already handles both), or one of the short phase
// codes GOAL API's own docs show ("1H"/"2H"/"HT"/"FT"/"NS"/...). Both are
// handled here rather than picking one, since this hasn't been confirmed
// live yet specifically for a UEFA fixture. Deliberately returns null
// (write nothing) for anything unrecognized -- the same conservative
// "don't guess" principle resolveClub()/parseLiveMinute() already apply,
// since a wrong guess here would show a wrong status/score to real users
// mid-match, worse than a fixture staying on whatever it last had.
function deriveEuropeanStatus(matchStatus) {
  if (typeof matchStatus !== 'string') return null;
  const s = matchStatus.trim();
  if (parseLiveMinute(s)) return 'live';
  if (/^(1h|2h|et|live|inplay|in_play|in.progress)$/i.test(s)) return 'live';
  if (/^(ft|finished|full.?time|aet|pen|penalties|ended)$/i.test(s)) return 'finished';
  return null;
}

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

  // No league_id filter -- deliberately covers every tracked league
  // (domestic and UEFA alike), same as it always has; home_team_name/
  // away_team_name are only ever populated (and only ever read) for the
  // European ones.
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, home_team_name, away_team_name, kickoff_at, status, goal_api_id')
    .or(`status.eq.live,and(status.eq.scheduled,kickoff_at.gte.${recently},kickoff_at.lte.${soon})`);
  if (error) throw error;
  return data;
}

// Resolves each candidate's internal fixture id to GOAL API's own fixture id
// (a cuid, unrelated to our numeric id) -- same club-name matching approach
// as syncLineups.js, grouped by (league, date) so one GOAL API call covers
// every candidate in that league on that date instead of one call per fixture.
//
// Cached in fixtures.goal_api_id (048_fixtures_goal_api_id.sql) once
// resolved, same pattern as clubs/players' own goal_api_id columns --
// confirmed live this was the dominant GOAL API request source in this
// file: connectAndTrack()'s 60-second rescan calls this on every tick for
// as long as anything is live/about to kick off, and before this cache
// existed that meant a fresh getLeagueFixtures() call per active league on
// EVERY tick, all day, for an id that never changes once a match exists. A
// candidate with a cached id now costs zero GOAL API calls to resolve --
// only genuinely new (never-before-seen) fixtures still need one.
export async function resolveGoalApiIds(supabase, candidates) {
  if (candidates.length === 0) return new Map();

  const { data: dbLeagues, error: leaguesErr } = await supabase.from('leagues').select('id, slug');
  if (leaguesErr) throw leaguesErr;
  const leagueSlugById = new Map(dbLeagues.map((l) => [l.id, l.slug]));

  const { data: allClubs, error: clubsErr } = await supabase.from('clubs').select('id, name, short_name, aliases, league_id');
  if (clubsErr) throw clubsErr;
  const clubById = new Map(allClubs.map((c) => [c.id, c]));

  const uefaSlugs = new Set(UEFA_COMPETITIONS.map((c) => c.slug));

  // internal fixture id -> either
  //   { goalApiId, leagueSlug, kind: 'domestic', homeClubId, awayClubId }
  // or
  //   { goalApiId, leagueSlug, kind: 'european', homeTeamName, awayTeamName }
  const resolved = new Map();
  const unresolvedDomestic = [];
  const unresolvedEuropean = [];

  for (const f of candidates) {
    const leagueSlug = leagueSlugById.get(f.league_id);
    if (!leagueSlug) continue;
    const isEuropean = uefaSlugs.has(leagueSlug);

    if (f.goal_api_id) {
      resolved.set(
        f.id,
        isEuropean
          ? { goalApiId: f.goal_api_id, leagueSlug, kind: 'european', homeTeamName: f.home_team_name, awayTeamName: f.away_team_name }
          : { goalApiId: f.goal_api_id, leagueSlug, kind: 'domestic', homeClubId: f.home_club_id, awayClubId: f.away_club_id }
      );
      continue;
    }
    (isEuropean ? unresolvedEuropean : unresolvedDomestic).push({ ...f, leagueSlug });
  }

  // Domestic resolution -- unchanged from before this file tracked Europe
  // too, just reading from unresolvedDomestic instead of a single shared
  // unresolved array.
  if (unresolvedDomestic.length > 0) {
    const groups = new Map();
    for (const f of unresolvedDomestic) {
      const league = LEAGUES.find((l) => l.slug === f.leagueSlug);
      if (!league) continue;
      const dateStr = toDateString(new Date(f.kickoff_at));
      const key = `${league.slug}|${dateStr}`;
      if (!groups.has(key)) groups.set(key, { league, dateStr, fixtures: [] });
      groups.get(key).fixtures.push(f);
    }

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
        const goalApiId = String(match.id);
        resolved.set(f.id, { goalApiId, leagueSlug: league.slug, kind: 'domestic', homeClubId: homeClub.id, awayClubId: awayClub.id });

        // Best-effort: a failed write here only costs re-resolving this
        // one fixture again on the next rescan, never lost live coverage.
        const { error: cacheErr } = await supabase.from('fixtures').update({ goal_api_id: goalApiId }).eq('id', f.id);
        if (cacheErr) console.error(`Failed to cache goal_api_id for fixture ${f.id}:`, cacheErr.message);
      }
    }
  }

  // European resolution -- in practice only ever reached for UCL: EL/UECL
  // fixtures always already carry a goal_api_id from
  // syncEuropeanFixtures.js (GOAL API is their fixture source directly),
  // so they hit the `if (f.goal_api_id)` branch above and never land in
  // unresolvedEuropean at all. UCL comes from football-data.org instead,
  // so it needs the same team-name resolution syncEuropeanLineups.js
  // already does against GOAL API's own UCL fixture list.
  if (unresolvedEuropean.length > 0) {
    const compBySlug = new Map(UEFA_COMPETITIONS.map((c) => [c.slug, c]));
    const groups = new Map();
    for (const f of unresolvedEuropean) {
      const comp = compBySlug.get(f.leagueSlug);
      if (!comp) continue;
      const dateStr = toDateString(new Date(f.kickoff_at));
      const key = `${comp.slug}|${dateStr}`;
      if (!groups.has(key)) groups.set(key, { comp, dateStr, fixtures: [] });
      groups.get(key).fixtures.push(f);
    }

    for (const { comp, dateStr, fixtures } of groups.values()) {
      let apiFixtures;
      try {
        apiFixtures = await getLeagueFixtures(comp.goalApiLeagueId, dateStr);
      } catch (err) {
        console.error(`GOAL API fixtures failed for ${comp.slug} ${dateStr}:`, err.message);
        continue;
      }

      for (const f of fixtures) {
        const match = apiFixtures.find(
          (m) => namesLooselyMatch(m.homeTeam?.name, f.home_team_name) && namesLooselyMatch(m.awayTeam?.name, f.away_team_name)
        );
        if (!match) continue;
        const goalApiId = String(match.id);
        resolved.set(f.id, {
          goalApiId,
          leagueSlug: comp.slug,
          kind: 'european',
          homeTeamName: f.home_team_name,
          awayTeamName: f.away_team_name,
        });

        const { error: cacheErr } = await supabase.from('fixtures').update({ goal_api_id: goalApiId }).eq('id', f.id);
        if (cacheErr) console.error(`Failed to cache goal_api_id for fixture ${f.id}:`, cacheErr.message);
      }
    }
  }

  return resolved;
}

// GOAL API's own o.g. convention, confirmed live: an own goal's scorer name
// (with a "(o.g.)" suffix) appears under the field of the team that
// *benefited*, not the scorer's actual club -- same call made in
// syncLineups.js's buildEventRows for the REST path, kept consistent here.
//
// `info` (the same value byGoalApiId stores) decides how a side is keyed --
// club_id for a domestic fixture, team_name for a European one (no clubs
// table row -- see this file's own top comment). sideRef() below returns
// exactly one of {club_id} or {team_name} to spread into a row, never both
// and never neither, matching lineups.js/sql/054's own "exactly one set"
// contract.
function sideRef(info, isHomeField) {
  return info.kind === 'european'
    ? { team_name: isHomeField ? info.homeTeamName : info.awayTeamName }
    : { club_id: isHomeField ? info.homeClubId : info.awayClubId };
}

function buildLiveEventRows(fixtureId, info, data) {
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
      ...sideRef(info, isHomeField),
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
      ...sideRef(info, isHomeField),
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
        ...sideRef(info, side === 'home'),
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
// lastCounts, lastMinutes, lastEuropeanState and pendingRemovals are the
// same Maps across every reconnect attempt within one run (mutated in
// place, never recreated here), so a fresh connection picks up exactly
// where a dropped one left off -- already-known matches, minutes, event
// counts and European status/score don't need rediscovering, and a
// reconnect's own auth_success re-subscribes to all of them in one go,
// same as the very first connection did.
async function connectAndTrack({ supabase, deadline, byGoalApiId, lastCounts, lastMinutes, lastEuropeanState, pendingRemovals, confirmedRetractions, counts }) {
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

      // GOAL API signals a score correction (VAR disallowed goal, data fix)
      // without a new match_update by sending score.changed. The affected
      // goal will be absent from the next match_update's goalscorer array, but
      // our normal 2-miss threshold would wait for a second absent observation
      // before deleting it -- unnecessarily slow when the server has already
      // told us a retraction happened. Mark the match so the next
      // match_update's first miss is treated as confirmed-stale immediately.
      if (msg.type === 'score.changed') {
        const goalApiId = String(msg.data?.id ?? msg.matchId ?? '');
        if (goalApiId && byGoalApiId.has(goalApiId)) {
          confirmedRetractions.add(goalApiId);
        }
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
            let droppedForCapacity = 0;
            for (const [fixtureId, info] of freshResolved) {
              if (byGoalApiId.has(info.goalApiId)) continue;
              if (byGoalApiId.size >= MAX_SUBSCRIPTIONS) {
                droppedForCapacity += 1;
                continue;
              }
              byGoalApiId.set(info.goalApiId, { ...info, fixtureId });
              subscribeTo(info.goalApiId);
            }
            // Confirmed live: MAX_SUBSCRIPTIONS (GOAL API FREE plan's own
            // cap) was silently dropping any candidate past the 25th, on
            // both the run's initial batch (see syncLiveEvents() below) and
            // here on every rescan -- a busy Saturday with overlapping
            // kickoffs across all 5 tracked leagues can realistically reach
            // it, and nothing surfaced that some fixtures got no live WS
            // coverage that run. Logged (not just silently counted) so it
            // shows up in the workflow run's own output, same visibility
            // level as every other failure path in this file.
            counts.droppedForCapacity += droppedForCapacity;
            if (droppedForCapacity > 0) {
              console.error(
                `Live events: MAX_SUBSCRIPTIONS (${MAX_SUBSCRIPTIONS}) reached during rescan -- ${droppedForCapacity} newly-live fixture(s) got no live WS coverage this run.`
              );
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

      // European fixtures only (see this file's own top comment) -- this
      // connection is their sole live writer for status/score, unlike
      // domestic fixtures where syncLiveScores.js/the webhook already own
      // it. lastEuropeanState starts empty each run (same as
      // lastMinutes/lastCounts), so the STATUS_RANK comparison falls back
      // to 'scheduled' (rank 0) for a goalApiId not yet seen this run --
      // exactly matching the actual DB state findCandidateFixtures()
      // already filtered these fixtures down to (scheduled or live).
      if (info.kind === 'european') {
        const derivedStatus = deriveEuropeanStatus(data.match_status);
        const home = Number.parseInt(data.match_hometeam_score, 10);
        const away = Number.parseInt(data.match_awayteam_score, 10);
        const prev = lastEuropeanState.get(goalApiId) ?? { status: 'scheduled', home: null, away: null };
        const nextStatus =
          derivedStatus && STATUS_RANK[derivedStatus] >= STATUS_RANK[prev.status] ? derivedStatus : prev.status;
        const nextHome = Number.isFinite(home) ? home : prev.home;
        const nextAway = Number.isFinite(away) ? away : prev.away;
        if (nextStatus !== prev.status || nextHome !== prev.home || nextAway !== prev.away) {
          lastEuropeanState.set(goalApiId, { status: nextStatus, home: nextHome, away: nextAway });
          const update = { status: nextStatus };
          if (nextHome != null) update.home_score = nextHome;
          if (nextAway != null) update.away_score = nextAway;
          const { error: statusErr } = await supabase.from('fixtures').update(update).eq('id', info.fixtureId);
          if (statusErr) console.error(`Failed to update status/score for European fixture ${info.fixtureId}:`, statusErr.message);
        }
      }

      const count = countLiveEvents(data);
      if (lastCounts.get(goalApiId) === count) return; // no new goal/card/sub since last push
      lastCounts.set(goalApiId, count);

      const rows = buildLiveEventRows(info.fixtureId, info, data);

      // GOAL API's own payload can retract an event after this file already
      // wrote it -- a goal disallowed on VAR review (or, less commonly, a
      // card rescinded) simply disappears from data.goalscorer/cards/
      // substitutions on a later match_update, with no dedicated type or
      // other signal marking it as a retraction rather than a regular
      // update. rows above is always the FULL current set (buildLiveEventRows
      // rebuilds it from scratch every time, not incrementally), so in
      // principle anything already stored under this fixture's own 'live-'
      // event_keys that ISN'T in that current set has fallen out.
      //
      // Confirmed live this can't be trusted on a single observation,
      // though: a first version of this deleted on the spot and it wiped
      // out real goals mid-match -- GOAL API's own WS push can hand back a
      // momentarily incomplete snapshot (e.g. right after this file's own
      // reconnect logic re-subscribes), which looks identical to a
      // retraction from here. Requiring the SAME key to be missing on two
      // separate match_updates in a row (pendingRemovals, per goalApiId)
      // absorbs exactly that: a one-off incomplete snapshot self-heals the
      // moment the next update reports the goal again, before ever reaching
      // the two-strikes threshold, while a genuine retraction stays missing
      // on every subsequent update and gets deleted on the second one.
      const currentKeys = new Set(rows.map((r) => r.event_key));
      const { data: existingLiveRows, error: existingErr } = await supabase
        .from('match_events')
        .select('event_key')
        .eq('fixture_id', info.fixtureId)
        .like('event_key', 'live-%');
      if (existingErr) {
        console.error(`Failed to read existing live events for fixture ${info.fixtureId}:`, existingErr.message);
      } else {
        const missingNow = existingLiveRows.map((r) => r.event_key).filter((k) => !currentKeys.has(k));
        const previouslyMissing = pendingRemovals.get(goalApiId) ?? new Set();
        // In-memory signal: score.changed arrived on this WS connection.
        const scoreChangedPending = confirmedRetractions.delete(goalApiId);

        // DB-backed signal: score.changed arrived at the webhook while this
        // connection was absent (2-min gap between GitHub Actions runs, or a
        // reconnect at that exact moment). Only check the DB when there are
        // actually missing keys and the in-memory flag isn't already set --
        // avoids an extra round-trip on every match_update for the common
        // no-missing-events case.
        let dbFlagPending = false;
        if (!scoreChangedPending && missingNow.length > 0) {
          const { data: fixtureFlag, error: flagErr } = await supabase
            .from('fixtures')
            .select('score_correction_pending')
            .eq('id', info.fixtureId)
            .single();
          if (flagErr) {
            console.error(`Failed to read score_correction_pending for fixture ${info.fixtureId}:`, flagErr.message);
          } else if (fixtureFlag?.score_correction_pending) {
            dbFlagPending = true;
            const { error: clearErr } = await supabase
              .from('fixtures')
              .update({ score_correction_pending: false })
              .eq('id', info.fixtureId);
            if (clearErr) console.error(`Failed to clear score_correction_pending for fixture ${info.fixtureId}:`, clearErr.message);
          }
        }

        const confirmedStale = (scoreChangedPending || dbFlagPending)
          ? missingNow
          : missingNow.filter((k) => previouslyMissing.has(k));

        if (confirmedStale.length > 0) {
          const { error: deleteErr } = await supabase
            .from('match_events')
            .delete()
            .eq('fixture_id', info.fixtureId)
            .in('event_key', confirmedStale);
          if (deleteErr) console.error(`Failed to delete retracted events for fixture ${info.fixtureId}:`, deleteErr.message);
          else counts.rowsDeleted += confirmedStale.length;
        }

        // Baseline for the next check: exactly what's missing right now
        // (whether newly-noticed or just-confirmed-and-deleted) -- a key
        // that reappears in the meantime simply won't be in missingNow next
        // time and drops out of this set on its own, no separate clearing
        // needed.
        pendingRemovals.set(goalApiId, new Set(missingNow));
      }

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
  if (candidates.length === 0) return { subscribed: 0, updatesHandled: 0, rowsWritten: 0, rowsDeleted: 0, droppedForCapacity: 0, reconnects: 0 };

  const resolved = await resolveGoalApiIds(supabase, candidates);
  if (resolved.size === 0) return { subscribed: 0, updatesHandled: 0, rowsWritten: 0, rowsDeleted: 0, droppedForCapacity: 0, reconnects: 0 };

  // goalApiId -> { fixtureId, leagueSlug, kind, ...(homeClubId/awayClubId | homeTeamName/awayTeamName) }
  const byGoalApiId = new Map();
  for (const [fixtureId, info] of resolved) {
    if (byGoalApiId.size >= MAX_SUBSCRIPTIONS) break;
    byGoalApiId.set(info.goalApiId, { ...info, fixtureId });
  }
  // See connectAndTrack()'s rescan loop for why this is logged, not just
  // silently dropped -- same MAX_SUBSCRIPTIONS cap, hit here on the run's
  // very first batch instead of a later rescan.
  const droppedAtStart = resolved.size - byGoalApiId.size;
  if (droppedAtStart > 0) {
    console.error(
      `Live events: MAX_SUBSCRIPTIONS (${MAX_SUBSCRIPTIONS}) reached at run start -- ${droppedAtStart} candidate fixture(s) got no live WS coverage this run.`
    );
  }

  const lastCounts = new Map(); // goalApiId -> last-seen total event count, to skip no-op writes
  const lastMinutes = new Map(); // goalApiId -> last-written live minute, to skip no-op writes
  const lastEuropeanState = new Map(); // goalApiId -> last-written {status, home, away} for a European fixture, to skip no-op writes and guard against regression
  const pendingRemovals = new Map(); // goalApiId -> event_keys missing on the immediately-preceding check, awaiting a second miss to confirm
  const confirmedRetractions = new Set(); // goalApiIds where score.changed arrived -- next match_update's first miss triggers immediate deletion
  const counts = { updatesHandled: 0, rowsWritten: 0, rowsDeleted: 0, droppedForCapacity: droppedAtStart };
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
      reachedDeadline = await connectAndTrack({ supabase, deadline, byGoalApiId, lastCounts, lastMinutes, lastEuropeanState, pendingRemovals, confirmedRetractions, counts });
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

  return {
    subscribed: byGoalApiId.size,
    updatesHandled: counts.updatesHandled,
    rowsWritten: counts.rowsWritten,
    rowsDeleted: counts.rowsDeleted,
    droppedForCapacity: counts.droppedForCapacity,
    reconnects,
  };
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
