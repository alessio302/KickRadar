import { getMatches, getLineups } from './highlightlyClient.js';

// Read-only smoke test, no DB writes. Doesn't wait for one of our 4
// leagues' next kickoff -- Highlightly covers 950+ leagues worldwide, so
// there's almost always SOME match live or about to kick off somewhere.
// This finds whichever match is closest to "now" globally (today's date,
// no country filter, first page) and checks its lineup -- if the free
// plan populates real lineup data close to kickoff at all, this proves
// the mechanism works well before our own leagues' next match on 2026-08-28.
function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

async function fetchAllPages(dateStr) {
  const all = [];
  let offset = 0;
  for (;;) {
    const data = await getMatches({ date: dateStr, offset, limit: 100 });
    const matches = Array.isArray(data) ? data : data.data || data.matches || [];
    all.push(...matches);
    const total = data.pagination?.totalCount ?? all.length;
    offset += matches.length;
    if (matches.length === 0 || offset >= total) break;
  }
  return all;
}

async function run() {
  const now = new Date();
  const dateStr = toDateString(now);
  console.log(`=== GET /matches?date=${dateStr} (no country filter, all pages) ===`);
  const matches = await fetchAllPages(dateStr);
  console.log(`${matches.length} matches total for today`);

  const withDelta = matches
    .filter((m) => m.date)
    .map((m) => ({ m, minutesFromNow: (new Date(m.date) - now) / 60000 }));

  // Prefer something already under way or about to start (lineups should
  // be confirmed by kickoff) over something merely "today" -- sort by
  // absolute closeness to now, but bias toward matches that have already
  // kicked off (negative minutesFromNow, up to 2h into the match) since
  // those are the surest bet for populated data if the endpoint works at
  // all.
  const live = withDelta.filter((x) => x.minutesFromNow <= 0 && x.minutesFromNow > -120);
  const soon = withDelta.filter((x) => x.minutesFromNow > 0 && x.minutesFromNow <= 45);
  const candidates = [...live, ...soon].sort((a, b) => a.minutesFromNow - b.minutesFromNow);

  if (candidates.length === 0) {
    console.log('\nNothing live or kicking off within 45 min across all of today\'s matches. Closest matches found:');
    withDelta
      .sort((a, b) => Math.abs(a.minutesFromNow) - Math.abs(b.minutesFromNow))
      .slice(0, 5)
      .forEach(({ m, minutesFromNow }) => console.log(`  ${Math.round(minutesFromNow)} min: ${m.league?.name} ${m.homeTeam?.name} vs ${m.awayTeam?.name} (id ${m.id})`));
    console.log('\nRe-run closer to one of those, or in a bit if kickoffs are clustered a few hours out.');
    return;
  }

  console.log(`\n${candidates.length} live/imminent candidates, trying up to 3:`);
  for (const { m, minutesFromNow } of candidates.slice(0, 3)) {
    console.log(`\n=== GET /lineups/${m.id} (${m.league?.name}: ${m.homeTeam?.name} vs ${m.awayTeam?.name}, ${Math.round(minutesFromNow)} min from now) ===`);
    try {
      const lineups = await getLineups(m.id);
      console.log(JSON.stringify(lineups, null, 2).slice(0, 3000));
    } catch (err) {
      console.error('failed:', err.message);
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
