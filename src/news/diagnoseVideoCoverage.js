import { getLeagueVideos } from '../lineups/goalApiClient.js';
import { LEAGUES } from '../config/leagues.js';

// Temporary diagnostic: checking whether GOAL API's Videos resource
// (/videos/league/:leagueId) actually has real highlight coverage for all
// 5 tracked leagues before building the highlights feature on top of it,
// same "confirm live before relying on it" approach this project already
// used for Odds/Predictions-style uneven-coverage surprises.
async function main() {
  for (const league of LEAGUES) {
    try {
      const videos = await getLeagueVideos(league.goalApiLeagueId);
      console.log(
        JSON.stringify({
          league: league.slug,
          count: videos.length,
          sample: videos.slice(0, 2),
        })
      );
    } catch (err) {
      console.error(`${league.slug} failed:`, err.message);
    }
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
