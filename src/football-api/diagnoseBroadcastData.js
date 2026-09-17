// One-off: does either data source we already pay/free-tier for (GOAL API,
// football-data.org) carry TV-broadcast info on a fixture/match object that
// we're just not reading yet? User wants a "where to watch" pill on every
// fixture card -- cheapest path would be a field already in an existing
// response, so check that before researching a dedicated broadcast-data API.
// Dumps every top-level key (and any nested object/array's own keys) for one
// real upcoming fixture from each source, grepping for anything broadcast-
///tv-/channel-/stream-shaped.
import { getLeagueFixtures } from '../lineups/goalApiClient.js';
import { getMatches } from './client.js';
import { LEAGUES } from '../config/leagues.js';

function describeKeys(label, obj) {
  console.log(`\n--- ${label}: top-level keys ---`);
  console.log(Object.keys(obj).join(', '));
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      console.log(`  ${key} (object) -> ${Object.keys(value).join(', ')}`);
    }
  }
  const raw = JSON.stringify(obj).toLowerCase();
  const hits = ['broadcast', 'tv', 'channel', 'stream', 'watch'].filter((word) => raw.includes(word));
  console.log(`  hits for broadcast/tv/channel/stream/watch: ${hits.length ? hits.join(', ') : 'NONE'}`);
}

async function main() {
  const bundesliga = LEAGUES.find((l) => l.slug === 'bundesliga');

  const today = new Date().toISOString().slice(0, 10);
  const goalFixtures = await getLeagueFixtures(bundesliga.goalApiLeagueId, today);
  console.log(`GOAL API: ${goalFixtures.length} fixtures for ${today}`);
  if (goalFixtures[0]) {
    describeKeys('GOAL API fixture', goalFixtures[0]);
    console.log('\nFull first fixture (GOAL API):');
    console.log(JSON.stringify(goalFixtures[0], null, 2));
  } else {
    console.log('No GOAL API fixtures today -- widen the date manually if needed.');
  }

  const in7Days = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const fdMatches = await getMatches({ competitionId: bundesliga.externalCompetitionId, dateFrom: today, dateTo: in7Days });
  console.log(`\nfootball-data.org: ${fdMatches.length} matches ${today}..${in7Days}`);
  if (fdMatches[0]) {
    describeKeys('football-data.org match', fdMatches[0]);
    console.log('\nFull first match (football-data.org):');
    console.log(JSON.stringify(fdMatches[0], null, 2));
  }
}

main()
  .catch((err) => {
    console.error('Diagnose failed:', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
