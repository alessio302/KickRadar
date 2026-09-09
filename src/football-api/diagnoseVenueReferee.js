// One-off diagnostic: does football-data.org's UCL match object carry a
// per-match venue/referee, and does GOAL API's EL/UECL fixture object carry
// a stadium/referee field? Neither is currently stored for European
// fixtures (syncEuropeanFixtures.js only maps kickoff/score/status/team
// names) -- this checks what's actually available before adding columns
// and sync logic for fields that might not exist. Meant to be deleted
// after use, same as this project's other diagnose-*.js scripts.
import { getMatches } from './client.js';
import { getLeagueFixtures } from '../lineups/goalApiClient.js';
import { UEFA_COMPETITIONS } from '../config/leagues.js';

async function main() {
  const ucl = UEFA_COMPETITIONS.find((c) => c.slug === 'champions-league');
  const matches = await getMatches({ competitionId: ucl.externalCompetitionId });
  const finished = matches.find((m) => m.status === 'FINISHED') ?? matches[0];
  console.log('--- football-data.org UCL match (raw) ---');
  console.log(JSON.stringify(finished, null, 2));

  const el = UEFA_COMPETITIONS.find((c) => c.slug === 'europa-league');
  const today = new Date().toISOString().slice(0, 10);
  for (let d = -3; d <= 3; d++) {
    const dt = new Date();
    dt.setUTCDate(dt.getUTCDate() + d);
    const dateStr = dt.toISOString().slice(0, 10);
    const fixtures = await getLeagueFixtures(el.goalApiLeagueId, dateStr);
    if (fixtures.length > 0) {
      console.log(`--- GOAL API EL fixture (raw, date ${dateStr}) ---`);
      console.log(JSON.stringify(fixtures[0], null, 2));
      break;
    }
  }
  console.log('today was', today);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
