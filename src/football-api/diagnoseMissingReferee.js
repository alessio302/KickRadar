// Read-only: reproduces syncFixtures.js's EXACT live call (getMatches with
// no date filter, the whole current season in one call) to check whether
// football-data.org's raw response carries `referees` for matches kicking
// off within the next couple of hours whose lineups are already confirmed
// in our own DB -- distinguishes "our sync is wrong/stale" from "the
// provider genuinely has no referee assignment yet at this point".
import { getMatches } from './client.js';

const TARGETS = [
  { competitionId: 2021, matchId: 560567, label: 'Everton vs Man United (PL)' },
  { competitionId: 2019, matchId: 558615, label: 'Frosinone vs Venezia (Serie A)' },
  { competitionId: 2019, matchId: 558612, label: 'Parma vs Monza (Serie A)' },
  { competitionId: 2015, matchId: 559700, label: 'Troyes vs Strasbourg (Ligue 1)' },
];

async function main() {
  for (const { competitionId, matchId, label } of TARGETS) {
    const matches = await getMatches({ competitionId });
    const match = matches.find((m) => m.id === matchId);
    console.log(`\n--- ${label} (match ${matchId}) ---`);
    if (!match) {
      console.log('NOT FOUND in this call at all');
      continue;
    }
    console.log('status:', match.status, '| utcDate:', match.utcDate);
    console.log('referees:', JSON.stringify(match.referees));
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
