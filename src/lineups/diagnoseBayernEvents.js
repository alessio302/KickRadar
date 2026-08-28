import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();

  const { data: fixture, error: fErr } = await supabase
    .from('fixtures')
    .select('id, status, home_score, away_score, kickoff_at, events_synced_at, updated_at')
    .eq('id', 36)
    .single();
  if (fErr) throw fErr;
  console.log('Fixture 36:', JSON.stringify(fixture, null, 2));

  const { data: events, error: eErr } = await supabase
    .from('match_events')
    .select('id, type, minute, player, club_id')
    .eq('fixture_id', 36)
    .order('minute', { ascending: true });
  if (eErr) throw eErr;
  console.log(`match_events for fixture 36: ${events.length} rows`);
  for (const e of events) console.log(`  ${e.minute}' ${e.type} ${e.player ?? ''}`);

  console.log('Now (UTC):', new Date().toISOString());
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
