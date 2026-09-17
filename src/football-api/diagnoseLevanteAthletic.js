// One-off: what does football-data.org currently report for the La Liga
// fixture stuck at status='live' in our own DB (Levante UD vs Athletic
// Club, external_fixture_id known from fixtures.external_fixture_id) --
// settles whether syncLiveScores.js's own poll loop is legitimately seeing
// this match still IN_PLAY/PAUSED upstream (a data issue on football-data.
// org's side, outside our control) vs. some other bug in our own matching.
// Run via workflow_dispatch, GH Actions only (this sandbox's outbound
// network to football-data.org is unreliable).
import { getMatches } from './client.js';
import { LEAGUES } from '../config/leagues.js';

async function main() {
  const laLiga = LEAGUES.find((l) => l.slug === 'la-liga');
  const matches = await getMatches({ competitionId: laLiga.externalCompetitionId, dateFrom: '2026-09-16', dateTo: '2026-09-17' });
  console.log(`${matches.length} La Liga matches 2026-09-16..2026-09-17`);
  for (const m of matches) {
    console.log(
      `id=${m.id} ${m.homeTeam?.name} vs ${m.awayTeam?.name} status=${m.status} score=${m.score?.fullTime?.home}-${m.score?.fullTime?.away} utcDate=${m.utcDate}`
    );
  }
}

main().catch((err) => {
  console.error('Diagnose failed:', err);
  process.exitCode = 1;
});
