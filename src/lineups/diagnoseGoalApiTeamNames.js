// One-off: does GOAL API's fixtures-by-date endpoint carry a short-name
// field for teams, the way football-data.org's shortName does (already
// wired up for UCL in syncEuropeanFixtures.js)? If so, EL/UECL could get
// the same short-name treatment. GOAL API's daily REST budget was
// exhausted the day this was first needed (2026-09-09); this runs once
// it's fresh again.
import { getLeagueFixtures } from './goalApiClient.js';
import { UEFA_COMPETITIONS } from '../config/leagues.js';

const comp = UEFA_COMPETITIONS.find((c) => c.slug === 'europa-league');
const today = new Date().toISOString().slice(0, 10);
const fixtures = await getLeagueFixtures(comp.goalApiLeagueId, today);
console.log(`fetched ${fixtures.length} fixtures for ${today}`);
if (fixtures[0]) {
  console.log(JSON.stringify(fixtures[0], null, 2));
} else {
  // No fixtures today -- widen the search across the next 14 days so this
  // still finds something to inspect.
  for (let d = 1; d <= 14; d++) {
    const dt = new Date();
    dt.setUTCDate(dt.getUTCDate() + d);
    const dateStr = dt.toISOString().slice(0, 10);
    const f = await getLeagueFixtures(comp.goalApiLeagueId, dateStr);
    if (f.length > 0) {
      console.log(`fetched ${f.length} fixtures for ${dateStr}`);
      console.log(JSON.stringify(f[0], null, 2));
      break;
    }
  }
}
