// One-off: user's friend reports a "Vitinha -> Rennes" rumor card showing
// up when filtered by PSG (his favorite club), but PSG has nothing to do
// with that story -- it's about a different real player who happens to
// share the same common nickname as PSG's own Vitinha (Vitor Machado
// Ferreira). Checking the actual stored row(s) and squad_memberships to
// see which mechanism attributed PSG to this story. Read-only, no DB
// writes.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();

  const { data: transfers, error } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, from_club_id, to_club_id, player_id, source, source_url, summary, published_at')
    .ilike('player_name', '%vitinha%');
  if (error) throw error;

  console.log(`--- ${transfers.length} transfers rows matching "Vitinha" ---`);
  for (const t of transfers) {
    console.log(
      `#${t.id} "${t.player_name}" (${t.from_club} [id=${t.from_club_id}] -> ${t.to_club} [id=${t.to_club_id}]) player_id=${t.player_id} source=${t.source} published_at=${t.published_at}`
    );
    console.log(`  summary: ${t.summary}`);
    console.log(`  url: ${t.source_url}`);
  }

  const { data: squadRows, error: squadErr } = await supabase
    .from('squad_memberships')
    .select('player_name, normalized_name, club_id, clubs(name)')
    .ilike('normalized_name', '%vitinha%');
  if (squadErr) throw squadErr;
  console.log(`\n--- ${squadRows.length} squad_memberships rows matching "vitinha" ---`);
  for (const r of squadRows) {
    console.log(`  "${r.player_name}" (normalized: "${r.normalized_name}") -> club_id=${r.club_id} (${r.clubs?.name})`);
  }

  const { data: players, error: playersErr } = await supabase
    .from('players')
    .select('id, normalized_name, transfermarkt_url')
    .ilike('normalized_name', '%vitinha%');
  if (playersErr) throw playersErr;
  console.log(`\n--- ${players.length} players rows matching "vitinha" ---`);
  for (const p of players) {
    console.log(`  #${p.id} normalized_name="${p.normalized_name}" transfermarkt_url=${p.transfermarkt_url}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
