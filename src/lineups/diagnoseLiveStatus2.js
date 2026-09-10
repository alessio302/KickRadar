// Temporary diagnostic (removed after use): checks GOAL API's raw REST
// fixtures-by-date snapshot RIGHT NOW for the 3 CL matches whose score/
// live_minute has been frozen in our own DB since ~20:40-21:15 UTC
// (Bayern-Bodo/Glimt, Man United-Sabah, Como-Leipzig), to tell apart two
// possibilities: (a) GOAL API's own source data is itself stuck at the
// same frozen values (an upstream data problem, nothing fixable here), or
// (b) GOAL API already has fresher data and our own polling pipeline has
// a live bug not picking it up.
import { getLeagueFixtures } from './goalApiClient.js';

const CL_LEAGUE_ID = 'cmr77dw3900f5rx06j05wgzv4';
const WATCH_IDS = new Set([
  'cmtje83082vu4r8071dujr2aj', // Bayern-Bodo
  'cmtje82y62vt1r8072j9utsfv', // ManUtd-Sabah
  'cmtje830b2vu6r807xmb63wdy', // Como-Leipzig
]);

async function main() {
  const fixtures = await getLeagueFixtures(CL_LEAGUE_ID, '2026-09-10');
  for (const m of fixtures) {
    if (!WATCH_IDS.has(String(m.id))) continue;
    console.log(JSON.stringify({
      id: m.id,
      home: m.homeTeam?.name,
      away: m.awayTeam?.name,
      matchStatus: m.matchStatus,
      matchLive: m.matchLive,
      homeTeamScore: m.homeTeamScore,
      awayTeamScore: m.awayTeamScore,
      updatedAt: m.updatedAt,
    }));
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
