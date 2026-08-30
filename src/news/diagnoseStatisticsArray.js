import { getPlayer } from '../lineups/goalApiClient.js';

// Temporary diagnostic: Grealish's GOAL API profile had statistics: [] (see
// this project's own recent "Diagnose Grealish GOAL API stats period" run)
// alongside stale flat stat fields (updatedAt weeks before the 2026/27
// season started). Checking a diverse sample of already-resolved players
// (different clubs/leagues, oldest- and newest-refreshed) for whether
// `statistics` is ever actually populated -- if it holds real per-season
// entries for at least some players, that's the real fix (read from there
// instead of the flat, season-less fields); if it's always empty, GOAL
// API's free tier likely just doesn't populate it at all.
const SAMPLE = [
  { name: 'Lilian Brassier', goalApiId: 'cmr7oa5p66hkkrx06d1x54o4b' },
  { name: 'Zaniolo', goalApiId: 'cmr7m6d185td6rx06kf12nveo' },
  { name: 'Kenan Yildiz', goalApiId: 'cmr7dkr6k2245rx06syz3skws' },
  { name: 'Montader Madjed', goalApiId: 'cmr7hu0ld3herrx06d6ab0k7c' },
  { name: 'Rowe', goalApiId: 'cmr7m6e2m5tlerx062awc0zii' },
  { name: 'Neal Maupay', goalApiId: 'cmr7hthqf3dkirx06f9v11pwv' },
  { name: 'Borrelli', goalApiId: 'cmr7m6dre5ti2rx069wgltrg1' },
  { name: 'Pedersen', goalApiId: 'cmr7m6f1e5tworx06vp7a90lu' },
  { name: 'ECB', goalApiId: 'cmrjez94d8mqgt507t3afupab' },
  { name: 'Noah Atubolu', goalApiId: 'cmr79jbt2049yrx06b92g3efh' },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  for (const { name, goalApiId } of SAMPLE) {
    try {
      const profile = await getPlayer(goalApiId);
      const stats = profile?.statistics;
      console.log(
        JSON.stringify({
          name,
          updatedAt: profile?.updatedAt,
          matchPlayed: profile?.matchPlayed,
          statisticsLength: Array.isArray(stats) ? stats.length : typeof stats,
          statistics: stats,
        })
      );
    } catch (err) {
      console.error(`${name} failed:`, err.message);
    }
    await sleep(3000);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
