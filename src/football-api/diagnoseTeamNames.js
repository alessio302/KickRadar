// One-off: does football-data.org's /matches endpoint embed a shortName/tla
// on homeTeam/awayTeam the same way its /teams endpoint does (already used
// by syncClubs.js for domestic clubs)? syncEuropeanFixtures.js's UCL sync
// currently only reads m.homeTeam.name -- if shortName is there too, UCL's
// home_team_name/away_team_name could use it instead, fixing long-name
// truncation in EuropaTab's fixture rows without a layout change.
import { getMatches } from './client.js';

const matches = await getMatches({ competitionId: 'CL' });
const sample = matches.slice(0, 5);
for (const m of sample) {
  console.log(JSON.stringify({ home: m.homeTeam, away: m.awayTeam }));
}
