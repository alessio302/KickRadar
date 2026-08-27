// One-off diagnostic: does football-data.org expose a dedicated
// head-to-head endpoint (/matches/{id}/head2head) that reaches back across
// PAST SEASONS, not just what we ourselves have synced into the fixtures
// table (currently a rolling ~60-day window -- see syncFixtures.js)? Our
// own useHeadToHead.js can only ever surface meetings within that window,
// and two clubs in the same league typically only meet twice a SEASON, so
// "last 5 meetings" needs multi-season history we don't store ourselves.
// Read-only, no DB writes.
import { getSupabaseClient } from '../db/supabaseClient.js';

const BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';

async function main() {
  const supabase = getSupabaseClient();
  const { data: fixture, error } = await supabase
    .from('fixtures')
    .select('external_fixture_id, home_club_id, away_club_id')
    .order('kickoff_at', { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;

  console.log('Using fixture external_fixture_id:', fixture.external_fixture_id);

  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  const res = await fetch(`${BASE_URL}/matches/${fixture.external_fixture_id}/head2head?limit=10`, {
    headers: { 'X-Auth-Token': apiKey },
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`Request failed: ${res.status} ${res.statusText} ${body}`);
    process.exit(1);
  }
  const data = JSON.parse(body);

  console.log('--- Top-level keys ---');
  console.log(Object.keys(data));
  console.log('--- aggregates ---');
  console.log(JSON.stringify(data.aggregates, null, 2));
  console.log(`--- matches: ${data.matches?.length ?? 0} total ---`);
  console.log(
    JSON.stringify(
      data.matches?.map((m) => ({ id: m.id, date: m.utcDate, season: m.season?.startDate, home: m.homeTeam.name, away: m.awayTeam.name, score: m.score?.fullTime })),
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
