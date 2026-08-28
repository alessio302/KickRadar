// Read-only, no DB writes: runs the real buildLineupTeam() transform
// (exported from syncLineups.js) against a real GOAL API lineups response,
// without needing an unconfirmed fixture to naturally trigger it. Fixture
// 36 (Bayern-Stuttgart) was already confirmed hours ago under the old
// Highlightly-shaped data, so syncLineups.js's own lineupNeeded() check
// skips it now -- this bypasses that to actually exercise the new
// transform code once, directly.
import { getFixtureLineups } from './goalApiClient.js';
import { buildLineupTeam } from './syncLineups.js';

async function main() {
  const fixtureId = 'cmsvp48ia9b7rpg07w5n7rhbg'; // Bayern-Stuttgart, already known
  const lineups = await getFixtureLineups(fixtureId);
  console.log('hasLineups:', lineups?.hasLineups, 'formations:', lineups?.homeFormation, lineups?.awayFormation);

  const home = buildLineupTeam(lineups.home);
  const away = buildLineupTeam(lineups.away);

  for (const [label, team] of [['home', home], ['away', away]]) {
    console.log(`\n${label}:`);
    console.log('  initialLineup row lengths:', team.initialLineup.map((r) => r.length));
    console.log('  substitutes count:', team.substitutes.length);
    for (const row of team.initialLineup) {
      console.log('  row:', JSON.stringify(row));
    }
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
