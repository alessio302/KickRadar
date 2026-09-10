// Temporary diagnostic (removed after use): checks GOAL API's raw REST
// fixtures-by-date snapshot for champions-league on 2026-09-10, to see
// whether match_status/score for Bayern-Bodø/Glimt and Man United-Sabah FK
// is missing at the SOURCE (GOAL API itself has no live data for them) or
// whether it's present via REST but just never arrived over our WS
// subscription.
import { getLeagueFixtures } from './goalApiClient.js';

const CL_LEAGUE_ID = 'cmr77dw3900f5rx06j05wgzv4';

async function main() {
  const fixtures = await getLeagueFixtures(CL_LEAGUE_ID, '2026-09-10');
  for (const m of fixtures) {
    console.log(JSON.stringify({
      id: m.id,
      home: m.homeTeam?.name,
      away: m.awayTeam?.name,
      status: m.status,
      homeScore: m.homeScore ?? m.homeTeam?.score,
      awayScore: m.awayScore ?? m.awayTeam?.score,
      raw: m,
    }));
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
