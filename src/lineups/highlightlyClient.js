// Thin adapter around Highlightly's football API. Confirmed live (see
// src/lineups/diagnoseHighlightly.js runs): a key from highlightly.net's
// own "native" signup, used against soccer.highlightly.net with
// x-rapidapi-key + x-rapidapi-host headers, returns real current-season
// match data -- unlike API-Football, whose free tier hard-blocks the
// current season entirely (src/football-api/client.js's history). Despite
// the header names, this has nothing to do with the RapidAPI marketplace;
// Highlightly's own gateway just reuses that header contract regardless
// of which of their two signup flows issued the key (Authorization:
// Bearer alone was rejected with "Missing mandatory HTTP Headers", even
// though that's what their native-platform docs claim to use).
//
// NOT yet confirmed: whether /matches actually surfaces our 4 target
// leagues (an unfiltered call returned 100 South/Central American
// matches, no country/league filter applied yet -- see
// diagnoseHighlightly.js), or whether lineups are populated with real
// data for those leagues close to kickoff (the one match checked so far
// was days out and came back empty, which is expected that far ahead).
const BASE_URL = process.env.HIGHLIGHTLY_BASE_URL || 'https://soccer.highlightly.net';
const RAPIDAPI_HOST = process.env.HIGHLIGHTLY_RAPIDAPI_HOST || 'soccer.highlightly.net';

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

export function getMatches({ date, leagueId, leagueName, countryName, offset, limit } = {}) {
  return call('/matches', { date, leagueId, leagueName, countryName, offset, limit });
}

export function getLineups(matchId) {
  return call(`/lineups/${matchId}`);
}

// Confirmed live (diagnoseEvents.js): returns an array of
// { team, time, type: 'Goal' | 'Yellow Card' | 'Red Card' | 'Substitution' | ...,
// player, playerId, assist, substituted, assistingPlayerId }, populated in
// real time during a live match.
export function getEvents(matchId) {
  return call(`/events/${matchId}`);
}
