// Read-only: checks whether football-data.org's per-match detail endpoint
// (not yet used anywhere in this repo) includes goal/booking/substitution
// events on the free tier -- if so, that's a much better fit than
// Highlightly for match_events: same trusted provider we already use for
// scores, no separate daily-quota risk (Highlightly's hard 100 req/day cap
// vs. football-data.org's per-minute-only limit), and we only need this
// once per finished fixture, not polled live.
const BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';

async function call(path) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  const res = await fetch(`${BASE_URL}${path}`, { headers: { 'X-Auth-Token': apiKey } });
  const body = await res.text();
  if (!res.ok) throw new Error(`football-data.org request failed: ${res.status} ${res.statusText} ${body}`);
  return JSON.parse(body);
}

async function main() {
  // Bayern Munich vs VfB Stuttgart, 2026-08-28, external_fixture_id 565776
  // (confirmed earlier today via the per-competition matches endpoint).
  const matchId = 565776;
  const data = await call(`/matches/${matchId}`);
  console.log('Top-level keys:', Object.keys(data).join(', '));
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
