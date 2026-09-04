import { getLeagueFixtures, getFixtureEvents } from './goalApiClient.js';
import { LEAGUES } from '../config/leagues.js';

// Temporary diagnostic (delete after use): live data-repair support for a
// specific ongoing match (Genoa CFC vs Como 1907, Serie A, kicked off
// 2026-09-04 18:45 UTC) whose match_events lost 3 real goals to a bug in
// syncLiveEvents.js's own retraction-reconciliation (since fixed) --
// prints GOAL API's REAL current goal list for this fixture so the
// missing rows can be repaired directly, without waiting for the match to
// finish and syncLineups.js's own post-finish reconciliation to clean it
// up on its own.
async function main() {
  const serieA = LEAGUES.find((l) => l.slug === 'serie-a');
  const fixtures = await getLeagueFixtures(serieA.goalApiLeagueId, '2026-09-04');
  const match = fixtures.find(
    (f) => /genoa/i.test(f.homeTeam?.name || '') && /como/i.test(f.awayTeam?.name || '')
  );
  if (!match) {
    console.log('Match not found. All fixtures today:', JSON.stringify(fixtures.map((f) => ({ id: f.id, home: f.homeTeam?.name, away: f.awayTeam?.name })), null, 2));
    return;
  }
  console.log('Found match:', JSON.stringify({ id: match.id, home: match.homeTeam?.name, away: match.awayTeam?.name }, null, 2));

  const goals = await getFixtureEvents(match.id);
  console.log('\n--- Current goal events ---');
  console.log(JSON.stringify(goals, null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
