// Temporary diagnostic: fetch each of the 5 tracked leagues' logo URL from
// GOAL API (embedded in the fixtures response's league object, confirmed
// live for Serie A already) so they can be hardcoded into web/src/lib/
// leagues.js the same way that file's `color` field already is -- leagues
// are a fixed set of 5, same static-config pattern, no DB column needed.
import { LEAGUES } from './../config/leagues.js';

const BASE_URL = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';
const apiKey = process.env.GOAL_API_KEY;

async function getLeagueLogo(leagueId) {
  // Wide date range increases the odds of hitting a real matchday for
  // every league in one shot; only the embedded league object is needed,
  // not the fixtures themselves.
  const dates = ['2026-08-30', '2026-08-23', '2026-08-16', '2026-09-06'];
  for (const date of dates) {
    const url = new URL(`${BASE_URL}/leagues/${leagueId}/fixtures`);
    url.searchParams.set('date', date);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const body = await res.text();
    if (!res.ok) continue;
    const parsed = JSON.parse(body);
    const logo = parsed.data?.[0]?.league?.logo;
    if (logo) return logo;
  }
  return null;
}

async function main() {
  for (const league of LEAGUES) {
    const logo = await getLeagueLogo(league.goalApiLeagueId);
    console.log(`${league.slug}: ${logo}`);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
