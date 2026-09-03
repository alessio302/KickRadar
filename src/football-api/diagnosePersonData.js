// Temporary diagnostic, part 2: GOAL API's squad-LIST endpoint
// (/teams/{id}/players) is missing Saka/Ødegaard/Çalhanoğlu entirely (see
// this session's earlier diagnostic). Checking whether GOAL API's own
// GLOBAL player search (/players?search=...) still has them in its
// database even though the squad listing doesn't surface them -- if so, a
// hybrid (football-data.org for "who's really on this squad", GOAL API
// search for each name's photo+stats) could close the gap without losing
// GOAL API's richer per-player data. Removed once answered.
import { searchPlayers, getPlayer } from '../lineups/goalApiClient.js';

const NAMES = ['Bukayo Saka', 'Martin Odegaard', 'Hakan Calhanoglu'];

async function main() {
  for (const name of NAMES) {
    console.log(`\n=== search "${name}" ===`);
    const hits = await searchPlayers(name);
    console.log(`  ${hits.length} hit(s)`);
    for (const h of hits.slice(0, 3)) {
      console.log(`  id=${h.id} name="${h.name}" team=${h.team?.name ?? 'null'}`);
    }
    if (hits[0]) {
      const full = await getPlayer(hits[0].id);
      console.log('  full profile of first hit:', JSON.stringify(full, null, 2));
    }
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
