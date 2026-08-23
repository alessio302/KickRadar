// Thin adapter around API-Football (api-sports.io), v3.
// Kept small and isolated so swapping to football-data.org later only
// means writing a second adapter with the same call() shape.

const BASE_URL = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';

async function call(path, params = {}) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error('Missing API_FOOTBALL_KEY env var.');
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    headers: { 'x-apisports-key': apiKey },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API-Football request failed: ${res.status} ${res.statusText} ${body}`);
  }

  const json = await res.json();
  if (Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors || {}).length) {
    throw new Error(`API-Football returned errors: ${JSON.stringify(json.errors)}`);
  }
  return json.response;
}

export function getTeams({ leagueId, season }) {
  return call('/teams', { league: leagueId, season });
}

// `from`/`to` are 'YYYY-MM-DD'. Used to pull the upcoming-fixtures window
// (Spiele-Tab needs "next matchday" plus a full-calendar fallback).
export function getFixtures({ leagueId, season, from, to }) {
  return call('/fixtures', { league: leagueId, season, from, to });
}

export function getCurrentSeason(referenceDate = new Date()) {
  // European domestic seasons span two calendar years (Aug-May); API-Football
  // labels a season by its starting year. Before July, assume last year's start.
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth() + 1;
  return month >= 7 ? year : year - 1;
}
