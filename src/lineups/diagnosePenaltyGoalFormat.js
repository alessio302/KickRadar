// User asked: GOAL API already flags an own goal (scorer name gets a
// "(o.g.)" suffix, confirmed live and already handled -- see
// syncLiveEvents.js's own isOwnGoal check) -- does it flag a PENALTY goal
// the same way, and if so why doesn't the app show it? Dumps the raw
// /fixtures/:id/events response for the live Juventus vs NEC fixture
// (goal_api_id known from the DB, confirmed live via the duplicate-goal
// bug report: N. Woltemade's 3rd Juventus goal was a penalty) to see the
// actual scorer-name string GOAL API sends for it.
import { getFixtureEvents } from './goalApiClient.js';

const GOAL_API_FIXTURE_ID = 'cmtlehm59midnlh06t602td0x';

async function main() {
  const events = await getFixtureEvents(GOAL_API_FIXTURE_ID);
  console.log(`${events.length} goal events`);
  console.log(JSON.stringify(events, null, 2));
}

main()
  .catch((err) => {
    console.error('Diagnose failed:', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
