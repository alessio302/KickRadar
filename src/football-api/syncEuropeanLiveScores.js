import { getSupabaseClient } from '../db/supabaseClient.js';
import { UEFA_COMPETITIONS } from '../config/leagues.js';
import { getLeagueFixtures } from '../lineups/goalApiClient.js';
import { sleep } from './client.js';
import { extractStatus, extractScore } from './syncEuropeanFixtures.js';

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
// RECENT_KICKOFF_WINDOW_MS candidate window forever still gets fixed here
// on this job's own next scheduled run regardless.
//
// No live_minute here -- GOAL API's fixtures-by-date response has no
// elapsed-minute field, only the phase text extractStatus() already
// parses (see syncEuropeanFixtures.js's own GOAL_STATUS_MAP). That stays
// syncLiveEvents.js's job alone, same as match_events.
const POLL_INTERVAL_MS = 120_000;

const JOB_BUDGET_MS = 13 * 60 * 1000;

const UPCOMING_WINDOW_MS = 10 * 60 * 1000;
const RECENT_KICKOFF_WINDOW_MS = 15 * 60 * 1000;

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

// Only decides whether this run's own internal loop keeps sleeping and
// re-polling, or exits early -- NOT which fixtures pollOnce() writes (see
// this file's own top comment). Scoped to the 3 UEFA competitions' own
// league rows so this doesn't keep a run alive over a domestic kickoff
// syncLiveScores.js already has covered.
async function hasFixtureStartingSoon(supabase, uefaLeagueIds) {
  const now = new Date();
  const recently = new Date(now.getTime() - RECENT_KICKOFF_WINDOW_MS).toISOString();
  const soon = new Date(now.getTime() + UPCOMING_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from('fixtures')
    .select('id', { count: 'exact', head: true })
    .in('league_id', uefaLeagueIds)
    .eq('status', 'scheduled')
    .gte('kickoff_at', recently)
    .lte('kickoff_at', soon);
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function pollOnce(supabase) {
  const dateStr = toDateString(new Date());
  let updated = 0;
  let stillLive = false;

  for (const comp of UEFA_COMPETITIONS) {
    let apiFixtures;
    try {
      apiFixtures = await getLeagueFixtures(comp.goalApiLeagueId, dateStr);
    } catch (err) {
      console.error(`Failed to fetch GOAL API fixtures for ${comp.slug} ${dateStr}:`, err.message);
      await sleep(500);
      continue;
    }

    for (const f of apiFixtures) {
      const fetchedStatus = extractStatus(f);
      if (fetchedStatus === 'live') stillLive = true;
      if (fetchedStatus !== 'live' && fetchedStatus !== 'finished') continue;

      const score = extractScore(f);
      const goalApiId = String(f.id);
      // Matches by goal_api_id alone, never upserts -- the row already
      // exists (created by syncEuropeanFixtures.js for EL/UECL always, or
      // for UCL once syncLiveEvents.js's own resolveGoalApiIds() has
      // cached it near kickoff, same as this file's WS counterpart relies
      // on). A goalApiId with no matching row yet simply updates 0 rows,
      // same as domestic's own equivalent no-op case.
      const { data: updatedRows, error } = await supabase
        .from('fixtures')
        .update({
          status: fetchedStatus,
          home_score: score.home,
          away_score: score.away,
          updated_at: new Date().toISOString(),
        })
        .eq('goal_api_id', goalApiId)
        .select('id');
      if (error) {
        console.error(`Failed to update live score for GOAL API fixture ${goalApiId}:`, error.message);
        continue;
      }
      if (updatedRows?.length) updated += 1;
    }

    await sleep(500); // stay well inside GOAL API's 15-min sliding budget, same spacing syncEuropeanFixtures.js uses
  }

  return { updated, stillLive };
}

export async function syncEuropeanLiveScores() {
  const supabase = getSupabaseClient();

  const { data: dbLeagues, error: leagueErr } = await supabase
    .from('leagues')
    .select('id')
    .in('slug', UEFA_COMPETITIONS.map((c) => c.slug));
  if (leagueErr) throw leagueErr;
  const uefaLeagueIds = dbLeagues.map((l) => l.id);
  if (uefaLeagueIds.length === 0) return { polls: 0, totalUpdated: 0 };

  const deadline = Date.now() + JOB_BUDGET_MS;
  let polls = 0;
  let totalUpdated = 0;

  while (Date.now() < deadline) {
    const { updated, stillLive } = await pollOnce(supabase);
    polls += 1;
    totalUpdated += updated;

    const keepGoing = stillLive || (await hasFixtureStartingSoon(supabase, uefaLeagueIds));
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
