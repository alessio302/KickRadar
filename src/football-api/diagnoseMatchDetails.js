// One-off: does football-data.org's single-match endpoint (GET
// /v4/matches/{id}) include event-level data (goalscorers, cards,
// substitutions) on the free tier, the way GOAL API's REST endpoints
// (getFixtureEvents/Cards/Substitutions in goalApiClient.js) do for the 5
// domestic leagues? Checked against a real, already-finished UCL fixture
// (external_fixture_id 575334, Sporting vs Galatasaray, 2026-09-09).
const apiKey = process.env.FOOTBALL_DATA_API_KEY;
const res = await fetch('https://api.football-data.org/v4/matches/575334', {
  headers: { 'X-Auth-Token': apiKey },
});
console.log('status:', res.status);
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
