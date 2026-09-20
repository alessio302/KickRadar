import { searchPlayers, getPlayer } from './goalApiClient.js';

// One-off diagnostic (see CLAUDE.md's "Testing/diagnosing the backend"
// section for why this runs via workflow_dispatch instead of a direct
// network call from the sandbox): resolves Andy Diouf's real GOAL API
// player id/photo so the stale, photo-less `players` row created by
// syncPlayerProfiles.js's football-data.org squad walk (current_club_name
// "FC Internazionale Milano", goal_api_id null) can be fixed with a direct
// SQL update instead of waiting for a future scheduled run's gap-fill
// budget to reach him.
async function main() {
  const results = await searchPlayers('Andy Diouf');
  console.log('searchPlayers("Andy Diouf") ->', JSON.stringify(results, null, 2));

  const interMatch = results.find((r) => (r.team?.name || '').toLowerCase().includes('inter'));
  const best = interMatch || results[0];
  if (!best) {
    console.log('No candidates at all.');
    return;
  }

  const profile = await getPlayer(best.id);
  console.log('getPlayer(', best.id, ') ->', JSON.stringify(profile, null, 2));
}

main().catch((err) => {
  console.error('diagnoseAndyDiouf failed:', err);
  process.exitCode = 1;
});
