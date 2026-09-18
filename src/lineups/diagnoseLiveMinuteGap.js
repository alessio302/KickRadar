// One-off diagnostic (see .github/workflows/diagnose-live-minute-gap.yml)
// for the user-reported symptom: domestic-league fixtures stayed on plain
// "LIVE" for many minutes with no elapsed-minute counter ever appearing,
// while the score itself updated instantly on a goal. The score comes from
// the goal-api-webhook Edge Function (a push, not a request against GOAL
// API's own daily budget) plus syncLiveScores.js's football-data.org
// backstop (a completely separate provider/budget) -- neither is affected
// by GOAL API's own daily cap. live_minute, per syncLiveEvents.js's own
// top comment, is written ONLY by that file's GOAL API WebSocket
// connection, which shares GOAL_API_KEY's 1000 req/day budget with every
// other GOAL API caller in the repo (syncLineups.js, syncEuropeanLineups.js,
// playerProfileResolver.js, this file's own resolveGoalApiIds()).
// goalApiClient.js's own comment documents a real incident (2026-09-16)
// where that shared budget hit 2955/day -- almost 3x over -- so once
// hasGoalApiBudgetRemaining()'s guard (950/1000 with safety margin) trips,
// syncLiveEvents() skips its ENTIRE run with one console.error and zero
// live_minute writes, which would look from the user's side exactly like
// "stuck on LIVE with the minute never updating," not "the daily quota is
// spent." This script checks whether that's what actually happened today.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { hasGoalApiBudgetRemaining } from './goalApiClient.js';

async function main() {
  const supabase = getSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: usageRow, error: usageErr } = await supabase
    .from('goal_api_usage')
    .select('day, request_count')
    .eq('day', today)
    .maybeSingle();
  if (usageErr) {
    console.error('Failed to read goal_api_usage:', usageErr.message);
  } else {
    console.log(`GOAL API usage for ${today}: ${usageRow?.request_count ?? 0} requests (documented cap 1000, hasGoalApiBudgetRemaining() trips at 950)`);
  }

  const budgetRemaining = await hasGoalApiBudgetRemaining();
  console.log(`hasGoalApiBudgetRemaining(): ${budgetRemaining} -- ${budgetRemaining ? 'syncLiveEvents() would run normally' : 'syncLiveEvents() is currently SKIPPING ITS ENTIRE RUN, live_minute cannot update for anyone until the budget resets at UTC midnight'}`);

  const { data: leagueRows, error: leaguesErr } = await supabase.from('leagues').select('id, slug');
  if (leaguesErr) console.error('Failed to read leagues:', leaguesErr.message);
  const leagueSlugById = new Map((leagueRows ?? []).map((l) => [l.id, l.slug]));

  const { data: liveFixtures, error: liveErr } = await supabase
    .from('fixtures')
    .select('id, league_id, kickoff_at, status, live_minute, goal_api_id, home_score, away_score')
    .eq('status', 'live')
    .order('kickoff_at', { ascending: true });
  if (liveErr) {
    console.error('Failed to read live fixtures:', liveErr.message);
  } else {
    console.log(`\n${liveFixtures.length} fixture(s) currently status='live':`);
    for (const f of liveFixtures) {
      const minutesSinceKickoff = Math.round((Date.now() - new Date(f.kickoff_at).getTime()) / 60000);
      console.log(
        `  fixture ${f.id} (${leagueSlugById.get(f.league_id) ?? '?'}): score ${f.home_score ?? '?'}-${f.away_score ?? '?'}, live_minute=${JSON.stringify(f.live_minute)}, goal_api_id=${f.goal_api_id ?? 'UNRESOLVED'}, kicked off ${minutesSinceKickoff}min ago`
      );
    }
  }

  // Last 5 days of usage, to see whether today's number is a one-off spike
  // or this has been a recurring, silent problem -- goal_api_usage_cleanup
  // (sql/041) only prunes past 120 days, so recent history is available.
  const { data: recentUsage, error: recentErr } = await supabase
    .from('goal_api_usage')
    .select('day, request_count')
    .order('day', { ascending: false })
    .limit(7);
  if (recentErr) {
    console.error('Failed to read recent goal_api_usage history:', recentErr.message);
  } else {
    console.log('\nLast 7 days of goal_api_usage:');
    for (const row of recentUsage) {
      console.log(`  ${row.day}: ${row.request_count} requests${row.request_count >= 950 ? '  <-- budget-exhausted territory' : ''}`);
    }
  }
}

main().catch((err) => {
  console.error('Diagnose live-minute gap failed:', err);
  process.exitCode = 1;
});
