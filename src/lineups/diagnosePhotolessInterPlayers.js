// Temporary diagnostic (per this project's usual pattern) -- user reported
// 7 Inter players still without a photo/squad_number weeks after
// syncPlayerProfiles.js's own gap-fill was supposed to catch them (Andy
// Diouf, Djed Spence, John Stones, Manuel Akanji, Marcus Thuram-Ulien,
// Petar Sucic, Aleksandar Stankovic), and asked whether this is another
// name-extraction bug like Francesco/Pio Esposito. Checks GOAL API's own
// live squad response and searchPlayers() results for each name directly,
// rather than guessing from pickBestMatch()'s club/team-field logic in the
// abstract.
import { getTeamSquad, searchPlayers } from './goalApiClient.js';

const INTER_GOAL_API_ID = 'cmr7fp1wj2n8urx061yv6ov5t';
const MISSING_NAMES = [
  'Andy Diouf',
  'Djed Spence',
  'John Stones',
  'Manuel Akanji',
  'Marcus Thuram-Ulien',
  'Petar Sucic',
  'Aleksandar Stankovic',
];

async function main() {
  console.log('--- getTeamSquad(Inter) ---');
  const squad = await getTeamSquad(INTER_GOAL_API_ID);
  console.log('squad length:', squad.length);
  console.log('squad names:', squad.map((p) => p.name).sort());

  for (const name of MISSING_NAMES) {
    console.log(`\n--- searchPlayers("${name}") ---`);
    try {
      const results = await searchPlayers(name);
      console.log('result count:', results.length);
      console.log(JSON.stringify(results.map((r) => ({ id: r.id, name: r.name, team: r.team })), null, 2));
    } catch (err) {
      console.error(`searchPlayers("${name}") failed:`, err.message);
    }
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
