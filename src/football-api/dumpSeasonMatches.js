import { getMatches } from './client.js';
import { LEAGUES } from '../config/leagues.js';

// Temporary: check whether football-data.org's /competitions/:id/matches
// endpoint really does return the whole current season when dateFrom/
// dateTo are omitted (as its docs imply), and how many rows that actually
// is -- before widening syncFixturesForLeague's rolling ~81-day window to
// the full season on that assumption.
async function main() {
  const laLiga = LEAGUES.find((l) => l.slug === 'la-liga');
  const matches = await getMatches({ competitionId: laLiga.externalCompetitionId });
  console.log(`Total matches returned (no date filter): ${matches.length}`);

  const byMatchday = new Map();
  for (const m of matches) {
    byMatchday.set(m.matchday, (byMatchday.get(m.matchday) ?? 0) + 1);
  }
  const matchdays = [...byMatchday.keys()].sort((a, b) => a - b);
  console.log(`Matchdays present: ${matchdays[0]} .. ${matchdays[matchdays.length - 1]} (${matchdays.length} total)`);

  const dates = matches.map((m) => m.utcDate).sort();
  console.log(`Earliest kickoff: ${dates[0]}`);
  console.log(`Latest kickoff: ${dates[dates.length - 1]}`);

  const statusCounts = {};
  for (const m of matches) statusCounts[m.status] = (statusCounts[m.status] ?? 0) + 1;
  console.log('Status breakdown:', statusCounts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
