import { getMatches, getLineups } from './highlightlyClient.js';

// Read-only smoke test, no DB writes. Doesn't wait for one of our 4
// leagues' next kickoff -- Highlightly covers 950+ leagues worldwide, so
// there's almost always SOME match live or about to kick off somewhere.
// This finds a match closest to "now" globally and checks its lineup --
// if the free plan populates real lineup data close to kickoff at all for
// a genuine first-division league, that's a strong proxy for what to
// expect from our own leagues before 2026-08-28.
//
// First live run (0 min filtering by competition tier): the 3 closest
// live/recent matches were an Armenian cup tie and two English U21
// development-league games, all ~2h post-kickoff and still completely
// empty. That's a real result, but minor/youth/reserve competitions are
// known to have worse lineup coverage industry-wide -- not conclusive
// about what a real first-division league like Bundesliga would get.
// Filter those out and prefer senior first-division football specifically.
const EXCLUDE_LEAGUE_PATTERN = /\b(U1[5-9]|U2[0-3]|Youth|Development|Reserve|Women|Cup|Trophy|Friendl(y|ies)|Qualif|Playoffs?)\b|(?:^|\s)II(?:\s|$)/i;

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

function isEmpty(lineups) {
  const home = lineups?.homeTeam;
  const away = lineups?.awayTeam;
  return (!home?.initialLineup || home.initialLineup.length === 0) && (!away?.initialLineup || away.initialLineup.length === 0);
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

  // -105..0: still plausibly in-play (a full match + stoppage rarely
  // exceeds ~100 min) through kickoff itself; 0..45: about to start.
  const inWindow = withDelta.filter((x) => x.minutesFromNow > -105 && x.minutesFromNow <= 45);
  const seniorFirstDivision = inWindow.filter((x) => !EXCLUDE_LEAGUE_PATTERN.test(x.m.league?.name || ''));
  const candidates = seniorFirstDivision.length > 0 ? seniorFirstDivision : inWindow;
  candidates.sort((a, b) => a.minutesFromNow - b.minutesFromNow);

  console.log(`\n${inWindow.length} matches within the window, ${seniorFirstDivision.length} look like senior first-division football:`);
  for (const { m, minutesFromNow } of candidates.slice(0, 15)) {
    console.log(`  ${Math.round(minutesFromNow)} min: ${m.league?.name} (${m.country?.name}) ${m.homeTeam?.name} vs ${m.awayTeam?.name} (id ${m.id})`);
  }

  if (candidates.length === 0) {
    console.log('\nNothing in the -105..+45 min window at all today. Closest matches found:');
    withDelta
      .sort((a, b) => Math.abs(a.minutesFromNow) - Math.abs(b.minutesFromNow))
      .slice(0, 5)
      .forEach(({ m, minutesFromNow }) => console.log(`  ${Math.round(minutesFromNow)} min: ${m.league?.name} ${m.homeTeam?.name} vs ${m.awayTeam?.name} (id ${m.id})`));
    return;
  }

  for (const { m, minutesFromNow } of candidates.slice(0, 5)) {
    console.log(`\n=== GET /lineups/${m.id} (${m.league?.name}: ${m.homeTeam?.name} vs ${m.awayTeam?.name}, ${Math.round(minutesFromNow)} min from now) ===`);
    try {
      const lineups = await getLineups(m.id);
      console.log(JSON.stringify(lineups, null, 2).slice(0, 3000));
      if (!isEmpty(lineups)) {
        console.log('\n>>> Populated response found, stopping here.');
        return;
      }
    } catch (err) {
      console.error('failed:', err.message);
    }
  }
  console.log('\nAll tried candidates came back empty.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
