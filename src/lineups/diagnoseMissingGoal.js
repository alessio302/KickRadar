import { getFixtureEvents, getFixtureCards, getFixtureSubstitutions } from './goalApiClient.js';

// One-off diagnostic (see CLAUDE.md's "Testing/diagnosing the backend"
// note): user-reported a Real Madrid vs Rayo Vallecano goal (17th minute,
// bringing the score to 2:0) that never showed up in match_events, even
// though the score itself (fixtures.home_score/away_score, written
// independently by syncLiveScores.js's football-data.org poll) was
// correct. Confirmed via direct Supabase query: only the 14th-minute
// Mbappe goal exists in match_events for this fixture.
//
// This calls GOAL API's own REST /fixtures/{id}/events (+cards+subs)
// endpoint directly for the same match, to tell apart two very different
// causes: if GOAL API's REST view already has the 17th-minute goal, the
// bug is in this app's own WS pipeline (syncLiveEvents.js missed/dropped
// something it should have caught); if GOAL API's REST view *also*
// doesn't have it yet, the gap is upstream (GOAL API hasn't recorded/
// exposed it yet) and not something this app's code can fix.
const GOAL_API_FIXTURE_ID = 'cmt71qlw4soj1t1072zhyagzi'; // fixtures.id=1582 (Real Madrid vs Rayo Vallecano)

async function main() {
  const [events, cards, substitutions] = await Promise.all([
    getFixtureEvents(GOAL_API_FIXTURE_ID),
    getFixtureCards(GOAL_API_FIXTURE_ID),
    getFixtureSubstitutions(GOAL_API_FIXTURE_ID),
  ]);
  console.log('--- events ---');
  console.log(JSON.stringify(events, null, 2));
  console.log('--- cards ---');
  console.log(JSON.stringify(cards, null, 2));
  console.log('--- substitutions ---');
  console.log(JSON.stringify(substitutions, null, 2));
}

main().catch((err) => {
  console.error('Diagnose failed:', err);
  process.exitCode = 1;
});
