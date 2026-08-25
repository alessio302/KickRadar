import { getSupabaseClient } from '../db/supabaseClient.js';

// One-off: deletes the specific bad row confirmed by diagnoseBonny.js --
// "Ange-Yoan Bonny, Parma Calcio 1913 -> ACF Fiorentina" (id
// 7acc3836-0ceb-47f3-8029-79745d95c213), a mis-extraction from an article
// actually filed under tuttomercatoweb's /inter/ section. squad_memberships
// already had Bonny at Inter, matching neither side of the story. The
// underlying extraction bug is fixed in runNewsScraper.js (rejects any
// future story where the player is confirmed at a third club); this just
// removes the one bad row that already made it in before that fix landed.
async function run() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('transfers')
    .delete()
    .eq('id', '7acc3836-0ceb-47f3-8029-79745d95c213')
    .select('id, player_name, from_club, to_club');
  if (error) throw error;
  console.log('Deleted:', JSON.stringify(data, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
