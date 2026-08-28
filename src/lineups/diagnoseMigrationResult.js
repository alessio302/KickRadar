import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();

  const { data: events, error: eErr } = await supabase
    .from('match_events')
    .select('type, minute, player, assist, substituted, club_id')
    .eq('fixture_id', 36)
    .order('minute', { ascending: true });
  if (eErr) throw eErr;
  console.log(`match_events for fixture 36: ${events.length} rows`);
  for (const e of events) console.log(`  ${e.minute}' [${e.type}] player=${e.player} assist=${e.assist} substituted=${e.substituted} club_id=${e.club_id}`);

  const { data: lineups, error: lErr } = await supabase
    .from('lineups')
    .select('club_id, confirmed, formation, players')
    .eq('fixture_id', 36);
  if (lErr) throw lErr;
  for (const l of lineups) {
    console.log(`\nLineup club_id=${l.club_id} confirmed=${l.confirmed} formation=${l.formation}`);
    console.log(`  initialLineup rows: ${l.players?.initialLineup?.map((row) => row.length).join(', ')}`);
    console.log(`  substitutes: ${l.players?.substitutes?.length}`);
    console.log(`  sample player:`, JSON.stringify(l.players?.initialLineup?.[0]?.[0]));
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
