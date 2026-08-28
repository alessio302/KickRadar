// Read-only: dumps football-data.org's raw status for today's Bundesliga
// matches, to see why syncLiveScores.js's 10 consecutive polls (spanning
// ~13 minutes, well past kickoff) never saw Bayern-VfB as IN_PLAY/PAUSED.
import { getMatches, getMatchesForDate } from './client.js';
import { LEAGUES } from '../config/leagues.js';

async function main() {
  const competitionIds = LEAGUES.map((l) => l.externalCompetitionId);
  const date = new Date().toISOString().slice(0, 10);

  console.log('--- Global /matches endpoint (what syncLiveScores.js uses) ---');
  const global = await getMatchesForDate({ competitionIds, date });
  console.log(`Fetched ${global.length} matches for ${date}`);
  for (const m of global) {
    console.log(
      `${m.id}: ${m.homeTeam?.name} vs ${m.awayTeam?.name} -- status=${m.status} utcDate=${m.utcDate} score=${JSON.stringify(m.score?.fullTime)}`
    );
  }

  console.log('--- Per-competition /competitions/2002/matches endpoint (Bundesliga only, what syncFixtures.js uses) ---');
  const perComp = await getMatches({ competitionId: 2002, dateFrom: date, dateTo: date });
  console.log(`Fetched ${perComp.length} matches for Bundesliga ${date}`);
  for (const m of perComp) {
    console.log(
      `${m.id}: ${m.homeTeam?.name} vs ${m.awayTeam?.name} -- status=${m.status} utcDate=${m.utcDate} score=${JSON.stringify(m.score?.fullTime)}`
    );
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
