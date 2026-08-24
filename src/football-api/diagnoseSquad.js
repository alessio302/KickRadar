// One-off diagnostic, not part of the regular pipeline. Checks whether
// football-data.org's free tier (already in use for clubs/fixtures)
// includes real squad data on the GET /teams/{id} endpoint -- conflicting
// info found while researching this (one source describes the Team
// resource as including "the squad for the current season" as standard;
// another says squad/player-level data needs the paid "deep data pack").
// Needed to answer: can we build a player-name -> current-club lookup for
// free, to resolve transfer direction (fromClub = actual current club)
// instead of guessing from which of two contradicting articles is newer?
import { getTeams } from './client.js';

const BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';

async function callRaw(path) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  const res = await fetch(`${BASE_URL}${path}`, { headers: { 'X-Auth-Token': apiKey } });
  const text = await res.text();
  console.log(`GET ${path} -> ${res.status} ${res.statusText}`);
  return { status: res.status, text };
}

async function main() {
  // Bundesliga (competition id 2002), same as src/config/leagues.js.
  const teams = await getTeams({ competitionId: 2002 });
  console.log(`Bundesliga teams: ${teams.length}. First team:`, { id: teams[0].id, name: teams[0].name });

  const { status, text } = await callRaw(`/teams/${teams[0].id}`);
  console.log('--- Raw response (first 6000 chars) ---');
  console.log(text.slice(0, 6000));

  if (status === 200) {
    const data = JSON.parse(text);
    console.log('\nTop-level keys:', Object.keys(data));
    console.log('squad field present:', 'squad' in data);
    console.log('squad length:', Array.isArray(data.squad) ? data.squad.length : 'n/a');
    if (Array.isArray(data.squad) && data.squad.length > 0) {
      console.log('First 3 squad entries:', data.squad.slice(0, 3));
    }
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
