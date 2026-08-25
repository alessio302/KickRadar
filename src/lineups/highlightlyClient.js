// Thin adapter around Highlightly's football API (via RapidAPI), candidate
// source for confirmed lineups. NOT yet confirmed to actually work on the
// free plan for our purposes -- API-Football looked just as promising on
// paper and turned out to block the current season entirely on its free
// tier (see src/football-api/client.js's history). Endpoint paths below
// are best-effort from indexed docs (highlightly.net itself isn't
// reachable from this sandbox's egress proxy) -- confirm against the
// diagnostic run and adjust if wrong, same as any other external source
// in this project.
const BASE_URL = process.env.HIGHLIGHTLY_BASE_URL || 'https://football-highlights-api.p.rapidapi.com';
const RAPIDAPI_HOST = process.env.HIGHLIGHTLY_RAPIDAPI_HOST || 'football-highlights-api.p.rapidapi.com';

async function call(path, params = {}) {
  const apiKey = process.env.HIGHLIGHTLY_API_KEY;
  if (!apiKey) {
    throw new Error('Missing HIGHLIGHTLY_API_KEY env var.');
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': RAPIDAPI_HOST,
    },
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Highlightly request failed: ${res.status} ${res.statusText} ${body}`);
  }
  return JSON.parse(body);
}

export function getMatches({ date, leagueId, leagueName, countryName } = {}) {
  return call('/matches', { date, leagueId, leagueName, countryName });
}

export function getLineups(matchId) {
  return call(`/lineups/${matchId}`);
}
