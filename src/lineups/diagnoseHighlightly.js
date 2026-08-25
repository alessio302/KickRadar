import { getMatches, getLineups } from './highlightlyClient.js';

// Read-only smoke test, no DB writes. Auth is confirmed working now (see
// git history of this file for the header-probing round) -- this pass
// checks the two things still open:
//
// 1. Does /matches actually surface our 4 target leagues when filtered by
//    country? An unfiltered call returned 100 South/Central American
//    matches with no sign of Serie A/Bundesliga/Premier League/Ligue 1 --
//    could be pagination (the response carries a `pagination` field) or
//    could mean a country/league filter is required.
// 2. Does /lineups return real starters for one of our leagues close to
//    kickoff? The one match checked so far was days out and came back
//    with an empty "Unknown" formation, which is expected that far ahead
//    regardless of source quality -- not yet a real signal either way.
const COUNTRIES = ['Italy', 'Germany', 'England', 'France'];

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

async function matchesForCountryAndDate(countryName, dateStr) {
  const data = await getMatches({ date: dateStr, countryName });
  const matches = Array.isArray(data) ? data : data.data || data.matches || [];
  return { matches, raw: data };
}

async function run() {
  const today = new Date();
  const dates = [0, 1, 2, 3, 4, 5, 6].map((d) => toDateString(new Date(today.getTime() + d * 24 * 60 * 60 * 1000)));

  const found = [];
  for (const countryName of COUNTRIES) {
    console.log(`\n=== country=${countryName} ===`);
    for (const dateStr of dates) {
      let result;
      try {
        result = await matchesForCountryAndDate(countryName, dateStr);
      } catch (err) {
        console.error(`  date=${dateStr} failed:`, err.message);
        continue;
      }
      if (result.matches.length === 0) continue;
      console.log(`  date=${dateStr}: ${result.matches.length} matches, pagination=${JSON.stringify(result.raw.pagination || null)}`);
      for (const m of result.matches.slice(0, 5)) {
        console.log('   ', JSON.stringify({ id: m.id, round: m.round, date: m.date, league: m.league, home: m.homeTeam?.name, away: m.awayTeam?.name }));
        found.push(m);
      }
    }
  }

  if (found.length === 0) {
    console.log('\nNo matches found for any of the 4 target countries across the next week -- either countryName isn\'t the right filter param, or these leagues aren\'t covered on the free plan. Try leagueName instead, or inspect a raw unfiltered response for a "league" field to find the right id.');
    return;
  }

  // Prefer a match that's closest to kickoff for the lineup check -- lineups
  // only populate ~30-40 min before, per Highlightly's docs, so a match
  // days out will always come back empty regardless of coverage quality.
  found.sort((a, b) => new Date(a.date) - new Date(b.date));
  const soonest = found[0];
  console.log(`\n=== GET /lineups/${soonest.id} (soonest match found: ${soonest.home ?? soonest.homeTeam?.name} vs ${soonest.away ?? soonest.awayTeam?.name}, ${soonest.date}) ===`);
  try {
    const lineups = await getLineups(soonest.id);
    console.log(JSON.stringify(lineups, null, 2).slice(0, 2000));
  } catch (err) {
    console.error('failed:', err.message);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
