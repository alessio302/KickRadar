import { getTeams } from './client.js';

// Throwaway diagnostic: syncClubs.js currently only extracts name/tla/id/
// venue/shortName from football-data.org's /competitions/{id}/teams
// response, discarding the rest of each team object -- checking whether a
// crest/logo URL field is already in there for free, before reaching for
// GOAL API (a completely separate, currently rate-limit-stressed source)
// for the same thing. Uses a completely different quota/provider than
// GOAL API, so safe to run alongside anything hitting that key. Read-only.
async function main() {
  const teams = await getTeams({ competitionId: 2019 }); // Serie A
  console.log(`${teams.length} teams returned`);
  console.log('Top-level keys on a team object:', Object.keys(teams[0]));
  for (const team of teams.slice(0, 5)) {
    console.log(`${team.name}: crest=${team.crest}`);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
