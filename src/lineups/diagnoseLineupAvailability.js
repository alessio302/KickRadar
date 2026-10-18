// One-off diagnostic: when does GOAL API first publish a fixture's starting
// XI, relative to kickoff? Polls /fixtures/:id/lineups once a minute for
// every fixture with a goal_api_id kicking off in the window below, logs
// each poll, and stops polling a fixture once both sides have a starting
// XI. Read-only -- writes nothing to Supabase. workflow_dispatch only.
//
// Exists because lineups-sync.yml's effective cadence is ~30 minutes, not
// 15, so the first sample after kickoff can be up to half an hour late and
// we can't tell GOAL's own publish time from our own polling gap.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { getFixtureLineups, hasGoalApiBudgetRemaining } from './goalApiClient.js';

const WINDOW_BEFORE_MIN = 30;
const WINDOW_AFTER_MIN = 90;
const POLL_INTERVAL_MS = 60_000;
// Leaves headroom under the workflow's own timeout-minutes.
const RUN_BUDGET_MS = 13 * 60_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startersCount(side) {
  return side?.startingLineups?.length ?? 0;
}

function minutesFrom(kickoffMs, atMs) {
  return ((atMs - kickoffMs) / 60_000).toFixed(1);
}

async function main() {
  const supabase = getSupabaseClient();
  const now = Date.now();
  const from = new Date(now - WINDOW_BEFORE_MIN * 60_000).toISOString();
  const to = new Date(now + WINDOW_AFTER_MIN * 60_000).toISOString();

  const { data: fixtures, error } = await supabase
    .from('fixtures')
    .select('id, kickoff_at, goal_api_id, home_club_id, away_club_id, home_team_name, away_team_name')
    .gte('kickoff_at', from)
    .lte('kickoff_at', to)
    .not('goal_api_id', 'is', null);
  if (error) throw error;

  if (fixtures.length === 0) {
    console.log('No fixtures with a goal_api_id kick off in the window -- nothing to watch.');
    return;
  }

  if (!(await hasGoalApiBudgetRemaining())) {
    console.error('GOAL API daily budget exhausted -- aborting before any call.');
    process.exitCode = 1;
    return;
  }

  const { data: clubs, error: clubsErr } = await supabase.from('clubs').select('id, name');
  if (clubsErr) throw clubsErr;
  const nameById = new Map(clubs.map((c) => [c.id, c.name]));

  const targets = fixtures.map((f) => ({
    ...f,
    label: `${f.home_team_name ?? nameById.get(f.home_club_id) ?? '?'} vs ${f.away_team_name ?? nameById.get(f.away_club_id) ?? '?'}`,
    kickoffMs: new Date(f.kickoff_at).getTime(),
    publishedAtMs: null,
    done: false,
  }));

  console.log(`Watching ${targets.length} fixture(s), polling every ${POLL_INTERVAL_MS / 1000}s.`);
  for (const t of targets) console.log(`  - ${t.label} (kickoff ${t.kickoff_at}, goal_api_id ${t.goal_api_id})`);

  const deadline = Date.now() + RUN_BUDGET_MS;
  while (Date.now() < deadline && targets.some((t) => !t.done)) {
    for (const t of targets) {
      if (t.done) continue;
      let lineups;
      try {
        lineups = await getFixtureLineups(t.goal_api_id);
      } catch (err) {
        console.error(`${t.label}: lineups call failed: ${err.message}`);
        continue;
      }
      const tickMs = Date.now();
      const home = startersCount(lineups?.home);
      const away = startersCount(lineups?.away);
      console.log(
        `${new Date(tickMs).toISOString()} | ${t.label} | T${minutesFrom(t.kickoffMs, tickMs)} min | starters home=${home} away=${away} hasLineups=${lineups?.hasLineups ?? 'n/a'}`
      );
      if (home > 0 && away > 0) {
        t.done = true;
        t.publishedAtMs = tickMs;
      }
    }
    if (targets.every((t) => t.done)) break;
    await sleep(POLL_INTERVAL_MS);
  }

  console.log('\nSummary (first poll where both sides had a starting XI):');
  for (const t of targets) {
    if (t.done) {
      console.log(`  - ${t.label}: T${minutesFrom(t.kickoffMs, t.publishedAtMs)} min after kickoff`);
    } else {
      console.log(`  - ${t.label}: NOT published within this run's polling window`);
    }
  }
}

main()
  .catch((err) => {
    console.error('Diagnose failed:', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
