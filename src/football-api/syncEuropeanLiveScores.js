import { getSupabaseClient } from '../db/supabaseClient.js';
import { UEFA_COMPETITIONS } from '../config/leagues.js';
import { getAllLeagueFixtures, hasGoalApiBudgetRemaining } from '../lineups/goalApiClient.js';
import { sleep } from './client.js';
import { extractStatus, extractScore } from './syncEuropeanFixtures.js';
import { STALE_LIVE_MS, closeStaleLiveFixtures } from '../db/staleLiveFixtures.js';
import { teamNamesMatch } from '../lineups/syncEuropeanHighlights.js';

// REST poll backstop for the 3 UEFA competitions' status/home_score/
// away_score, same relationship syncLiveScores.js has to the
// goal-api-webhook Edge Function for the 5 domestic leagues -- see this
// file's own reasoning for why it exists in syncEuropeanFixtures.js's top
// comment and syncLiveEvents.js's own updated comment: confirmed live
// 2026-09-10 that GOAL API's FREE-tier WebSocket accepts a subscribe for
// every candidate match but doesn't reliably PUSH match_update for all of
// them, so syncLiveEvents.js alone silently left fixtures stuck on
// 'scheduled' for their whole match despite GOAL API's own REST fixtures
// snapshot (extractStatus/extractScore, same parsing
// syncEuropeanFixtures.js's syncGoalApiCompetition already does) having
// the correct live status/score the entire time.
//
// Deliberately mirrors syncLiveScores.js's own pollOnce() shape rather
// than syncLiveEvents.js's candidate-window approach: fetching each
// competition's FULL day's fixture list every poll and writing any
// live-or-finished row in it, with no per-fixture "is this still within
// its kickoff window" gate, is what makes that file self-healing -- a
// fixture that missed one poll's write (or every poll before this job
// even started) still gets caught on the very next tick, and a stuck
// fixture that fell out of syncLiveEvents.js's own 15-minute
// candidate window forever still gets fixed here
// on this job's own next scheduled run regardless.
//
// No live_minute here -- GOAL API's fixtures-by-date response has no
// elapsed-minute field, only the phase text extractStatus() already
// parses (see syncEuropeanFixtures.js's own GOAL_STATUS_MAP). That stays
// syncLiveEvents.js's job alone, same as match_events.
const POLL_INTERVAL_MS = 120_000;

const JOB_BUDGET_MS = 13 * 60 * 1000;

const UPCOMING_WINDOW_MS = 10 * 60 * 1000;
// How far back a fixture still sitting on 'scheduled' keeps this job polling.
// Confirmed live (2026-10-14/15): Champions League matches that kicked off
// while the budget was spent stayed 'scheduled' forever, and a 3-hour window
// alone missed them once they were a day old. That is why the nightly sweep
// below looks back 48 hours.
const RECENT_SCHEDULED_WINDOW_MS = 4 * 60 * 60 * 1000;
const STALE_SCHEDULED_WINDOW_MS = 48 * 60 * 60 * 1000;
// Confirmed live (2026-10-21): rows whose goal_api_id never resolved kept
// this job polling for their whole 48-hour window, every run, and the
// European poll alone used 682 GOAL requests that day -- the budget ran out
// before the evening matches. Old 'scheduled' rows are now only swept once a
// day (at this UTC hour, when the 15-minute cron fires at :13/:28) and that
// sweep doesn't keep polling afterwards; live matches are unaffected.
const STALE_SWEEP_HOUR_UTC = 4;
const isStaleSweepRun = (now) => now.getUTCHours() === STALE_SWEEP_HOUR_UTC;


// Decides both whether this run should poll AT ALL (called once up front,
// before pollOnce() ever spends any GOAL API budget) and whether its own
// internal loop keeps sleeping and re-polling once it's started -- NOT
// which fixtures pollOnce() writes (see this file's own top comment).
// Scoped to the 3 UEFA competitions' own league rows so this doesn't keep
// a run alive (or start one) over a domestic kickoff syncLiveScores.js
// already has covered.
//
// Checks status='live' too, not just near-kickoff 'scheduled' -- confirmed
// live (2026-09-14, a day with zero UEFA fixtures at all): this file had
// no gate before its own first pollOnce() call, so it burned 3 real GOAL
// API requests (one per competition) on every single run regardless,
// roughly 96 times/day via the schedule watchdog's own re-triggering --
// about 288 wasted requests/day against the shared 1000/day budget for
// literally nothing to show for it. A fixture already sitting at 'live'
// (this run's own earlier poll, or a previous run) needs to keep being
// gated in too, not just one about to kick off -- the original name/scope
// (hasFixtureStartingSoon) undersold what this now checks.
//
// Returns the set of league ids (not just a boolean) so pollOnce() can skip
// any single competition with nothing live and nothing about to kick off --
// confirmed live (2026-10-14, a Champions League matchday): this job polled
// all three UEFA competitions every 2 minutes whenever ANY one of them had
// something on, using 1730 requests that day against the 1000/day budget,
// most of them for competitions with no match in play at all.
async function leaguesNeedingAttention(supabase, uefaLeagueIds) {
  const now = new Date();
  const scheduledWindow = isStaleSweepRun(now) ? STALE_SCHEDULED_WINDOW_MS : RECENT_SCHEDULED_WINDOW_MS;
  const sinceKickoff = new Date(now.getTime() - scheduledWindow).toISOString();
  const liveSince = new Date(now.getTime() - STALE_LIVE_MS).toISOString();
  const soon = new Date(now.getTime() + UPCOMING_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('fixtures')
    .select('league_id')
    .in('league_id', uefaLeagueIds)
    .or(`and(status.eq.live,kickoff_at.gte.${liveSince}),and(status.eq.scheduled,kickoff_at.gte.${sinceKickoff},kickoff_at.lte.${soon})`);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.league_id));
}

// Fixtures whose goal_api_id was never resolved. Confirmed live (2026-10-15):
// all 9 Champions League matches of 2026-10-14 had goal_api_id = NULL, and
// the poll below only ever matches by goal_api_id -- so even inside the
// window these rows were invisible to it. syncLiveEvents.js's
// resolveGoalApiIds() is the normal way that id gets filled, but it needs
// budget near kickoff, and that was exhausted on those evenings.
async function loadUnresolvedCandidates(supabase, leagueId) {
  const now = Date.now();
  const since = new Date(now - STALE_SCHEDULED_WINDOW_MS).toISOString();
  const until = new Date(now + UPCOMING_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, home_team_name, away_team_name')
    .eq('league_id', leagueId)
    .is('goal_api_id', null)
    .in('status', ['scheduled', 'live'])
    .gte('kickoff_at', since)
    .lte('kickoff_at', until);
  if (error) throw error;
  return (data ?? []).filter((r) => r.home_team_name && r.away_team_name);
}

// Matches a GOAL API fixture to exactly one unresolved row by team names,
// using the same order-independent matcher the highlight sync uses (GOAL's
// names and ours differ in wording: "FC Bayern München" vs "Bayern"). Only
// accepts a unique match -- two rows matching is treated as no match rather
// than guessing which one to tag with the id.
function findUnresolvedMatch(apiFixture, candidates) {
  const home = apiFixture.homeTeam?.name ?? apiFixture.homeTeamName;
  const away = apiFixture.awayTeam?.name ?? apiFixture.awayTeamName;
  if (!home || !away) return null;
  const matches = candidates.filter(
    (c) => teamNamesMatch(c.home_team_name, home) && teamNamesMatch(c.away_team_name, away)
  );
  return matches.length === 1 ? matches[0] : null;
}

async function pollOnce(supabase, activeLeagueIds, leagueIdBySlug) {
  let updated = 0;
  let stillLive = false;

  for (const comp of UEFA_COMPETITIONS) {
    if (!activeLeagueIds.has(leagueIdBySlug.get(comp.slug))) continue;

    let apiFixtures;
    try {
      // Confirmed live (2026-09-18): getLeagueFixtures(id, date)'s own
      // `date` param is silently ignored by this endpoint, so the old
      // dateStr-scoped call here almost never actually returned today's
      // live/finished fixtures. This poller only ever looks at 'live' or
      // 'finished' rows anyway (see the loop below), so it doesn't need
      // date-scoping at all -- status=LIVE (always tiny) plus status=
      // FINISHED's own first page (already most-recent-first, confirmed
      // live) covers everything this file cares about with no SCHEDULED
      // pages fetched at all.
      apiFixtures = await getAllLeagueFixtures(comp.goalApiLeagueId, { maxFinishedPages: 1, maxScheduledPages: 0 });
    } catch (err) {
      console.error(`Failed to fetch GOAL API fixtures for ${comp.slug}:`, err.message);
      await sleep(500);
      continue;
    }

    const unresolved = await loadUnresolvedCandidates(supabase, leagueIdBySlug.get(comp.slug));
    const unmatchedGoal = [];

    for (const f of apiFixtures) {
      const fetchedStatus = extractStatus(f);
      if (fetchedStatus === 'live') stillLive = true;
      if (fetchedStatus !== 'live' && fetchedStatus !== 'finished') continue;

      const score = extractScore(f);
      const goalApiId = String(f.id);
      const values = {
        status: fetchedStatus,
        home_score: score.home,
        away_score: score.away,
        updated_at: new Date().toISOString(),
      };
      // Matches by goal_api_id first. A goalApiId with no matching row yet
      // updates 0 rows and falls through to the name match below -- that's
      // how a row whose id never got resolved gets both its status and the
      // id itself, so later polls find it by goal_api_id directly.
      const { data: updatedRows, error } = await supabase
        .from('fixtures')
        .update(values)
        .eq('goal_api_id', goalApiId)
        .select('id');
      if (error) {
        console.error(`Failed to update live score for GOAL API fixture ${goalApiId}:`, error.message);
        continue;
      }
      if (updatedRows?.length) {
        updated += 1;
        continue;
      }

      const match = findUnresolvedMatch(f, unresolved);
      if (!match) {
        unmatchedGoal.push(`${f.homeTeam?.name ?? f.homeTeamName} vs ${f.awayTeam?.name ?? f.awayTeamName} (${fetchedStatus})`);
        continue;
      }
      const { error: resolveErr } = await supabase
        .from('fixtures')
        .update({ ...values, goal_api_id: goalApiId })
        .eq('id', match.id);
      if (resolveErr) {
        console.error(`Failed to resolve goal_api_id ${goalApiId} for fixture ${match.id}:`, resolveErr.message);
        continue;
      }
      console.log(`Resolved goal_api_id ${goalApiId} onto fixture ${match.id} by team names`);
      unresolved.splice(unresolved.indexOf(match), 1);
      updated += 1;
    }

    // Logged, not silent: a GOAL fixture that matched no row, while rows for
    // the same competition are still missing a goal_api_id, is the exact
    // shape of the 14.10. problem. Printing both lists lets the next run show
    // which name pairing failed to match, instead of guessing at an alias.
    if (unmatchedGoal.length > 0 && unresolved.length > 0) {
      console.warn(
        `${comp.slug}: unmatched GOAL fixtures: ${JSON.stringify(unmatchedGoal)} | rows without goal_api_id: ${JSON.stringify(unresolved.map((r) => `${r.home_team_name} vs ${r.away_team_name}`))}`
      );
    }

    await sleep(500); // stay well inside GOAL API's 15-min sliding budget, same spacing syncEuropeanFixtures.js uses
  }

  return { updated, stillLive };
}

export async function syncEuropeanLiveScores() {
  const supabase = getSupabaseClient();

  const { data: dbLeagues, error: leagueErr } = await supabase
    .from('leagues')
    .select('id, slug')
    .in('slug', UEFA_COMPETITIONS.map((c) => c.slug));
  if (leagueErr) throw leagueErr;
  const uefaLeagueIds = dbLeagues.map((l) => l.id);
  if (uefaLeagueIds.length === 0) return { polls: 0, totalUpdated: 0 };
  await closeStaleLiveFixtures(supabase, uefaLeagueIds);
  const leagueIdBySlug = new Map(dbLeagues.map((l) => [l.slug, l.id]));

  // Gate before the very first poll, not just between polls -- see
  // leaguesNeedingAttention()'s own comment for why this was missing.
  let active = await leaguesNeedingAttention(supabase, uefaLeagueIds);
  if (active.size === 0) return { polls: 0, totalUpdated: 0 };

  const deadline = Date.now() + JOB_BUDGET_MS;
  let polls = 0;
  let totalUpdated = 0;

  while (Date.now() < deadline) {
    // Checked before every poll, not just once up front: a single 14-minute
    // run can span the whole day's remaining budget. Confirmed live
    // (2026-10-14): this job ignored the shared daily cap entirely and
    // spent it by midday, leaving syncLiveEvents.js and the lineup sync
    // with nothing for the rest of the evening.
    if (!(await hasGoalApiBudgetRemaining())) {
      console.error('European live scores: GOAL API daily budget exhausted, stopping this run.');
      break;
    }

    const { updated, stillLive } = await pollOnce(supabase, active, leagueIdBySlug);
    polls += 1;
    totalUpdated += updated;

    active = await leaguesNeedingAttention(supabase, uefaLeagueIds);
    // The nightly sweep gets one pass. Only genuinely live matches keep it looping.
    const keepGoing = stillLive || (active.size > 0 && !isStaleSweepRun(new Date()));
    if (!keepGoing) break;

    await sleep(POLL_INTERVAL_MS);
  }

  return { polls, totalUpdated };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncEuropeanLiveScores()
    .then((result) => console.log('European live score sync complete:', result))
    .catch((err) => {
      console.error('European live score sync failed:', err);
      process.exitCode = 1;
    });
}
