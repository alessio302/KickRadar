// Read-only: does GOAL API (already integrated, 1000 req/day free, see
// src/lineups/goalApiClient.js) expose a dedicated player-profile endpoint
// (photo, position, nationality, birthdate, market value, stats) -- not
// just the bare playerId/name/position already embedded in lineup
// responses? If so, this could replace the current transfermarkt.de
// quick-search scrape (src/news/playerProfileResolver.js) with real,
// in-app profile data instead of an external search-results link.
//
// Grabs a real playerId from a live/recent Bundesliga fixture's lineup
// (guaranteed to exist and be resolvable), then tries several plausible
// endpoint shapes against it.
const BASE_URL = 'https://api.goal-api.com/v1';
const BUNDESLIGA_LEAGUE_ID = 'cmr77dvgm0002rx06rt2uqxii';

async function call(path) {
  const apiKey = process.env.GOAL_API_KEY;
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await res.text();
  return { status: res.status, body };
}

function toDateString(d) {
  return d.toISOString().slice(0, 10);
}

async function findAnyPlayerId() {
  // Scan today and the past few days for any fixture with a confirmed lineup.
  for (let back = 0; back <= 5; back++) {
    const date = toDateString(new Date(Date.now() - back * 24 * 60 * 60 * 1000));
    const { status, body } = await call(`/leagues/${BUNDESLIGA_LEAGUE_ID}/fixtures?date=${date}`);
    if (status !== 200) continue;
    const fixtures = JSON.parse(body).data ?? [];
    for (const f of fixtures) {
      const { status: lstatus, body: lbody } = await call(`/fixtures/${f.id}/lineups`);
      if (lstatus !== 200) continue;
      const lineup = JSON.parse(lbody).data;
      const entry = lineup?.home?.startingLineups?.[0] ?? lineup?.away?.startingLineups?.[0];
      if (entry?.playerId) return { playerId: entry.playerId, sampleEntry: entry };
    }
  }
  return null;
}

async function main() {
  console.log('--- Looking for a real playerId from a recent lineup ---');
  const found = await findAnyPlayerId();
  if (!found) {
    console.log('No lineup with a playerId found in the last 5 days -- cannot test player endpoints.');
    return;
  }
  console.log('Found playerId:', found.playerId);
  console.log('Sample lineup entry (for comparison against any /players response):', JSON.stringify(found.sampleEntry, null, 2));

  const candidatePaths = [
    `/players/${found.playerId}`,
    `/players/${found.playerId}/profile`,
    `/player/${found.playerId}`,
    `/players?search=${encodeURIComponent(found.sampleEntry.lineupPlayer || '')}`,
  ];

  for (const path of candidatePaths) {
    console.log(`\n--- GET ${path} ---`);
    try {
      const { status, body } = await call(path);
      console.log('status', status);
      console.log(body.slice(0, 2000));
    } catch (err) {
      console.log('request failed:', err.message);
    }
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
