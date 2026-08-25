// Thin adapter around Highlightly's football API, candidate source for
// confirmed lineups. NOT yet confirmed to actually work on the free plan
// for our purposes -- API-Football looked just as promising on paper and
// turned out to block the current season entirely on its free tier (see
// src/football-api/client.js's history).
//
// Highlightly has two completely separate, non-interchangeable
// distribution channels: the RapidAPI marketplace listing (its own host +
// x-rapidapi-key/x-rapidapi-host headers) and this project's own "native"
// platform (highlightly.net's own signup, Bearer-token auth). Confirmed
// live: a key from the native signup got "403 You are not subscribed to
// this API" against the RapidAPI host -- wrong channel entirely, not a
// plan/quota issue. This client targets the native platform, matching how
// the user actually got their key (highlightly.net's own "Get API Key").
// Endpoint paths are still best-effort from indexed docs (highlightly.net
// itself isn't reachable from this sandbox's egress proxy) -- confirm
// against the diagnostic run and adjust if still wrong.
const BASE_URL = process.env.HIGHLIGHTLY_BASE_URL || 'https://soccer.highlightly.net';

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
      Authorization: `Bearer ${apiKey}`,
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
