import { getSupabaseClient } from '../db/supabaseClient.js';

// One-off fix for the confirmed bad row: transfers.id
// 8e2133d3-f0da-4e11-84f9-90bd78c0c193 -- "Julián Álvarez, Club Atlético
// de Madrid -> RCD Espanyol de Barcelona". Real story (marca.com,
// joan-laporta-seguimos-interesados-julian-alvarez.html): Barça president
// Laporta saying the club remains interested in Álvarez -- the real
// destination is FC Barcelona, not Espanyol. clubMatch.js's resolveClub()
// picked Espanyol only because its full name happens to also contain the
// substring "barcelona" and it was iterated first; fixed at the source in
// this same commit (best-length-match instead of first-match). This
// corrects the one row that already got the wrong club before that fix.
async function run() {
  const supabase = getSupabaseClient();

  const { data: barca, error: barcaErr } = await supabase
    .from('clubs')
    .select('id, name')
    .eq('name', 'FC Barcelona')
    .single();
  if (barcaErr) throw barcaErr;
  console.log('resolved FC Barcelona club row:', barca);

  const { data: before, error: beforeErr } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, to_club_id')
    .eq('id', '8e2133d3-f0da-4e11-84f9-90bd78c0c193')
    .single();
  if (beforeErr) throw beforeErr;
  console.log('before:', before);

  const { error: updateErr } = await supabase
    .from('transfers')
    .update({ to_club: barca.name, to_club_id: barca.id })
    .eq('id', '8e2133d3-f0da-4e11-84f9-90bd78c0c193');
  if (updateErr) throw updateErr;

  const { data: after, error: afterErr } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, to_club_id')
    .eq('id', '8e2133d3-f0da-4e11-84f9-90bd78c0c193')
    .single();
  if (afterErr) throw afterErr;
  console.log('after:', after);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('fix failed:', err);
    process.exitCode = 1;
  });
