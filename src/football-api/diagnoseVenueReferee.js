// One-off diagnostic: does football-data.org's /competitions/{id}/matches
// response include venue/referee fields? syncFixtures.js currently discards
// everything except matchday/teams/kickoff/status/score -- need to see the
// raw shape before deciding whether to extend it (or fall back to
// Highlightly, already fetched in syncLineups.js) for the new
// referee/stadium display request.
import { LEAGUES } from '../config/leagues.js';
import { getMatches } from './client.js';

async function main() {
  const league = LEAGUES.find((l) => l.slug === 'serie-a');
  const today = new Date();
  const dateTo = today.toISOString().slice(0, 10);
  const from = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);
  const dateFrom = from.toISOString().slice(0, 10);

  const matches = await getMatches({ competitionId: league.externalCompetitionId, dateFrom, dateTo });
  console.log(`Fetched ${matches.length} matches for ${league.name} (${dateFrom}..${dateTo})`);

  const finished = matches.find((m) => m.status === 'FINISHED') || matches[0];
  if (!finished) {
    console.log('No matches found to inspect.');
    return;
  }

  console.log('--- Sample match (full raw object) ---');
  console.log(JSON.stringify(finished, null, 2));

  console.log('--- Field presence check ---');
  console.log('venue:', finished.venue);
  console.log('referees:', JSON.stringify(finished.referees));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
