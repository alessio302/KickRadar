import { getSupabaseClient } from '../db/supabaseClient.js';

// Read-only diagnostic for a reported duplicate: two "Bradley Barcola"
// cards, one from rmcsport ("Paris Saint-Germain FC -> Liverpool FC") and
// one from skysports ("PSG -> Liverpool FC"), that should have deduped
// into one. Hypothesis: "PSG" doesn't resolve via resolveClub() (clubs.
// aliases is never populated by any sync script -- confirmed earlier this
// session -- and "psg" isn't a literal substring of "paris saint-germain
// fc"), so one row has a real from_club_id and the other has raw
// unresolved text "PSG" -- two completely different lookup paths in the
// duplicate-candidate query, so they never got compared.
async function run() {
  const supabase = getSupabaseClient();

  const { data: rows, error } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, from_club_id, to_club, to_club_id, source, is_official, published_at, created_at')
    .ilike('player_name', '%barcola%')
    .order('created_at', { ascending: false });
  if (error) throw error;
  console.log(`found ${rows.length} rows`);
  for (const r of rows) console.log(JSON.stringify(r, null, 2));

  console.log('\n--- does "PSG" resolve via resolveClub()? ---');
  const { resolveClub } = await import('./clubMatch.js');
  const { data: clubs, error: clubsErr } = await supabase.from('clubs').select('id, name, aliases, league_id');
  if (clubsErr) throw clubsErr;
  const psgMatch = resolveClub('PSG', clubs);
  console.log('resolveClub("PSG", clubs) ->', psgMatch ? `${psgMatch.name} (id ${psgMatch.id})` : 'null');
  const fullMatch = resolveClub('Paris Saint-Germain FC', clubs);
  console.log('resolveClub("Paris Saint-Germain FC", clubs) ->', fullMatch ? `${fullMatch.name} (id ${fullMatch.id})` : 'null');

  const psgClub = clubs.find((c) => c.name.toLowerCase().includes('paris'));
  console.log('\nactual PSG club row:', JSON.stringify(psgClub));
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('diagnostic failed:', err);
    process.exit(1);
  });
