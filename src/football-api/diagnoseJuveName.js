import { getTeams } from './client.js';

// Throwaway diagnostic: need the exact team.name string football-data.org
// uses for Juventus before adding it to a dark-mode crest-invert override
// list -- a typo there would silently never match. Read-only.
async function main() {
  const teams = await getTeams({ competitionId: 2019 }); // Serie A
  const juve = teams.find((t) => t.name.toLowerCase().includes('juv'));
  console.log('Juventus team.name:', juve?.name);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
