import { getSupabaseClient } from '../db/supabaseClient.js';
import { normalize } from '../util/normalize.js';

// One-off, read-only diagnostic for a user-reported bad card: "Ange-Yoan
// Bonny, Parma Calcio 1913 -> ACF Fiorentina" shown as a rumor, but the
// user says Bonny currently plays for Inter. Checks whether our own
// squad_memberships data (the source of truth used for the existing
// squad-based direction-flip check, see runNewsScraper.js) already knows
// Bonny is at Inter -- if so, the existing check should be extended to
// *reject* a story where the player is confirmed at neither side, not
// just flip direction when they're confirmed at the "to" side.
async function run() {
  const supabase = getSupabaseClient();

  const { data: players, error: playersErr } = await supabase
    .from('players')
    .select('id, name, normalized_name')
    .ilike('name', '%Bonny%');
  if (playersErr) throw playersErr;
  console.log('players matching "Bonny":', JSON.stringify(players, null, 2));

  const { data: squadRows, error: squadErr } = await supabase
    .from('squad_memberships')
    .select('normalized_name, player_name, club_id, clubs(name)')
    .eq('normalized_name', normalize('Ange-Yoan Bonny'));
  if (squadErr) throw squadErr;
  console.log('squad_memberships for normalize("Ange-Yoan Bonny"):', JSON.stringify(squadRows, null, 2));

  const { data: transfers, error: transfersErr } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, from_club_id, to_club_id, is_official, source, source_url, published_at, created_at')
    .ilike('player_name', '%Bonny%');
  if (transfersErr) throw transfersErr;
  console.log('transfers rows matching "Bonny":', JSON.stringify(transfers, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
