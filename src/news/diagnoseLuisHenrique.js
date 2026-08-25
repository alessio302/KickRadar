import { getSupabaseClient } from '../db/supabaseClient.js';

// Read-only diagnostic (no DB writes) for the "got a push about Luis
// Henrique, tapped it, no card in the app" report. Prints the full row(s)
// plus which league they're tagged under, so we can compare against what
// the push notification actually said/linked to.
async function run() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, from_club_id, to_club, to_club_id, league_id, is_official, source, source_url, published_at, created_at, leagues(slug, name)')
    .ilike('player_name', '%Luis Henrique%');
  if (error) throw error;

  console.log(`Found ${data.length} row(s):\n`);
  for (const row of data) {
    console.log(JSON.stringify(row, null, 2));
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
