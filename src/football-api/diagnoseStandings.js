// One-off diagnostic: does football-data.org's /competitions/{id}/standings
// give us everything the requested "Tabelle" nav tab needs -- P/W/D/L/PTS/GD
// per team (confirmed likely), plus whether it splits into TOTAL/HOME/AWAY
// groups and includes a per-team "form" string, before promising those
// sub-tabs. Read-only, no DB writes.
import { LEAGUES } from '../config/leagues.js';

const BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';

async function main() {
  const league = LEAGUES.find((l) => l.slug === 'la-liga');
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  const url = `${BASE_URL}/competitions/${league.externalCompetitionId}/standings`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
  const body = await res.text();
  if (!res.ok) {
    console.error(`Request failed: ${res.status} ${res.statusText} ${body}`);
    process.exit(1);
  }
  const data = JSON.parse(body);

  console.log('--- Top-level keys ---');
  console.log(Object.keys(data));

  console.log('--- standings groups (type per group) ---');
  console.log(data.standings.map((s) => ({ stage: s.stage, type: s.type, group: s.group, entries: s.table.length })));

  console.log('--- Sample entry (first group, first team) ---');
  console.log(JSON.stringify(data.standings[0].table[0], null, 2));

  const withForm = data.standings.flatMap((s) => s.table).find((t) => t.form);
  console.log('--- Any entry with a form field? ---');
  console.log(withForm ? JSON.stringify(withForm.form) : 'none found');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
