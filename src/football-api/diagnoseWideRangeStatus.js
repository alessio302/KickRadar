// Read-only: syncFixtures.js's own fix (STATUS_RANK regression guard,
// commit 8015cc0) didn't actually correct the Lille-PSG row -- a re-run
// still wrote 'scheduled'/null even though a narrow single-day query for
// the same match returned FINISHED/2-2 minutes earlier. Reproduces
// syncFixtures.js's EXACT wide-range query (same dateFrom/dateTo math) to
// see whether football-data.org itself serves stale data for that specific
// query shape, or whether something else is wrong.
import { getMatches } from './client.js';

const FIXTURE_WINDOW_DAYS = 21;
const FIXTURE_PAST_WINDOW_DAYS = 60;

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const from = toDateString(new Date(Date.now() - FIXTURE_PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const to = toDateString(new Date(Date.now() + FIXTURE_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  console.log('Wide-range query:', { from, to });

  const wide = await getMatches({ competitionId: 2015, dateFrom: from, dateTo: to });
  const wideMatch = wide.find((m) => m.id === 559702);
  console.log('--- wide-range result for match 559702 ---');
  console.log(JSON.stringify(wideMatch, null, 2));

  console.log('--- narrow single-day query, for comparison ---');
  const narrow = await getMatches({ competitionId: 2015, dateFrom: '2026-08-28', dateTo: '2026-08-28' });
  const narrowMatch = narrow.find((m) => m.id === 559702);
  console.log(JSON.stringify(narrowMatch, null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
