import { getMatches, getLineups } from './highlightlyClient.js';

// Read-only smoke test, no DB writes. Answers the one question that
// actually decides whether Highlightly is worth building on: does the
// FREE plan return CURRENT SEASON match data at all? API-Football looked
// just as good on paper and turned out to hard-block the current season
// on its free tier ("Free plans do not have access to this season, try
// from 2022 to 2024") -- confirmed live when this project first tried it
// (see src/football-api/client.js). No point building the full lineups
// sync before ruling that out here too.
function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

async function tryMatchesForDate(dateStr) {
  console.log(`\n=== GET /matches?date=${dateStr} ===`);
  try {
    const data = await getMatches({ date: dateStr });
    const matches = Array.isArray(data) ? data : data.matches || data.data || [];
    console.log(`response shape: ${Array.isArray(data) ? 'array' : Object.keys(data).join(', ')}`);
    console.log(`${matches.length} matches`);
    for (const m of matches.slice(0, 10)) {
      console.log(' ', JSON.stringify(m).slice(0, 300));
    }
    return matches;
  } catch (err) {
    console.error('failed:', err.message);
    return [];
  }
}

async function run() {
  const today = new Date();
  const allMatches = [];
  for (const offsetDays of [0, 2, 5]) {
    const d = new Date(today.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    const matches = await tryMatchesForDate(toDateString(d));
    allMatches.push(...matches);
  }

  if (allMatches.length === 0) {
    console.log('\nNo matches returned for any tried date -- either the free plan blocks current-season data (as API-Football did) or the /matches endpoint/params guessed here are wrong. Check the raw error text above.');
    return;
  }

  const sample = allMatches[0];
  const matchId = sample.id ?? sample.matchId ?? sample.match_id;
  console.log(`\n=== GET /lineups/${matchId} (first match found) ===`);
  if (!matchId) {
    console.log('Could not find an id field on the sample match object -- inspect the JSON logged above to find the right field name.');
    return;
  }
  try {
    const lineups = await getLineups(matchId);
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
