// One-off: does Highlightly's /matches response include a referee field at
// all? football-data.org doesn't have one for the live Racing Santander vs
// Elche CF match yet, and the user asked whether Highlightly (already
// called for lineups/events) could backfill it. Dumps the raw match object
// for today's La Liga matches so we can see its actual shape instead of
// guessing. Read-only, no DB writes.
import { getMatches } from './highlightlyClient.js';

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const dateStr = toDateString(new Date());
  const data = await getMatches({ date: dateStr, countryName: 'Spain' });
  const all = Array.isArray(data) ? data : data.data || data.matches || [];
  const laLiga = all.filter((m) => m.league?.name === 'La Liga');
  console.log(`${laLiga.length} La Liga match(es) today.`);
  for (const m of laLiga) {
    console.log(JSON.stringify(m, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
