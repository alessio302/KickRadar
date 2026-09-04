// Temporary: check the real shape of GOAL API's `coach` field in a
// lineups response. syncLineups.js's normalizeCoach() was written
// defensively (bare string vs. player-shaped object) with no logged
// sample of a populated coach field to confirm against -- this queries
// one specific finished fixture known to already have a confirmed lineup
// (Real Sociedad vs Celta Vigo, 2026-09-03, LaLiga) and prints the raw
// `coach` value for both sides untouched, before any normalization.
// Removed once answered.
import { getLeagueFixtures, getFixtureLineups } from './goalApiClient.js';
import { LEAGUES } from '../config/leagues.js';

async function main() {
  const league = LEAGUES.find((l) => l.slug === 'la-liga');
  const fixtures = await getLeagueFixtures(league.goalApiLeagueId, '2026-09-03');
  console.log(`Fetched ${fixtures.length} LaLiga fixtures for 2026-09-03`);

  const match = fixtures.find(
    (m) => /sociedad/i.test(m.homeTeam?.name || '') && /celta/i.test(m.awayTeam?.name || '')
  );
  if (!match) {
    console.log(
      'Match not found. Team names seen:',
      fixtures.map((m) => `${m.homeTeam?.name} vs ${m.awayTeam?.name}`)
    );
    return;
  }
  console.log('Matched fixture:', match.id, match.homeTeam?.name, 'vs', match.awayTeam?.name);

  const lineups = await getFixtureLineups(match.id);
  console.log('--- raw home.coach ---');
  console.log(JSON.stringify(lineups?.home?.coach, null, 2));
  console.log('--- raw away.coach ---');
  console.log(JSON.stringify(lineups?.away?.coach, null, 2));
  console.log('--- raw home.missingPlayers (bonus, also unused today) ---');
  console.log(JSON.stringify(lineups?.home?.missingPlayers, null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
