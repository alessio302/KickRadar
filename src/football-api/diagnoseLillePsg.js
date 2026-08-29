// Read-only: the user reported Lille vs PSG (Ligue 1, 2026-08-28) still
// showing no score hours after it finished. Compares football-data.org's
// own current data for that match against what's actually stored in our
// fixtures table, to see whether the miss is on the source side or ours.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { getMatches, STATUS_MAP } from './client.js';

async function main() {
  const matches = await getMatches({ competitionId: 2015, dateFrom: '2026-08-28', dateTo: '2026-08-28' });
  const match = matches.find(
    (m) => /lille/i.test(m.homeTeam?.name || '') || /lille/i.test(m.awayTeam?.name || '')
  );
  console.log('--- football-data.org ---');
  console.log(JSON.stringify(match, null, 2));

  if (!match) {
    console.log('No Lille match found on football-data.org for that date.');
    return;
  }

  const supabase = getSupabaseClient();
  const { data: fixture, error } = await supabase
    .from('fixtures')
    .select('id, external_fixture_id, status, home_score, away_score, kickoff_at, updated_at')
    .eq('external_fixture_id', match.id)
    .maybeSingle();
  if (error) throw error;

  console.log('--- our fixtures row (matched by external_fixture_id) ---');
  console.log(JSON.stringify(fixture, null, 2));
  console.log('football-data.org status', match.status, '-> our STATUS_MAP ->', STATUS_MAP[match.status]);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
