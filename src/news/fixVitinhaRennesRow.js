// One-off: corrects the single stale Vitinha/Stade Rennais transfers row
// (id af247af3-9e92-4384-a19f-7bd5378b4110, created 2026-08-28T04:22:23Z --
// before the bare-single-word squad-correction guard fix at 09:22:29Z). The
// old squad-lookup bug overwrote from_club to "Paris Saint-Germain FC"
// because a different, unrelated PSG player also named "Vitinha" was the
// only match in squad_memberships; the actual footmercato article
// (https://www.footmercato.net/a4426439974792112226-le-stade-rennais-veut-relancer-lex-flop-de-lom-vitinha)
// states this Vitinha currently plays for Genoa. Fixes from_club to Genoa's
// real clubs row (name + id), verifying the row still looks like this exact
// mismatch before touching it. Delete this file + its workflow once run.
import { getSupabaseClient } from '../db/supabaseClient.js';

const ROW_ID = 'af247af3-9e92-4384-a19f-7bd5378b4110';

async function main() {
  const supabase = getSupabaseClient();

  const { data: row, error: rowErr } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, from_club_id, to_club, to_club_id')
    .eq('id', ROW_ID)
    .single();
  if (rowErr) throw rowErr;

  if (row.player_name !== 'Vitinha' || row.from_club !== 'Paris Saint-Germain FC' || row.to_club !== 'Stade Rennais FC 1901') {
    throw new Error(`Row no longer matches expected state, aborting: ${JSON.stringify(row)}`);
  }

  const { data: genoa, error: genoaErr } = await supabase
    .from('clubs')
    .select('id, name')
    .ilike('name', '%genoa%')
    .single();
  if (genoaErr) throw genoaErr;

  const { data: updated, error: updateErr } = await supabase
    .from('transfers')
    .update({ from_club: genoa.name, from_club_id: genoa.id })
    .eq('id', ROW_ID)
    .select('id, player_name, from_club, from_club_id, to_club, to_club_id')
    .single();
  if (updateErr) throw updateErr;

  console.log('Fixed:', JSON.stringify(updated, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
