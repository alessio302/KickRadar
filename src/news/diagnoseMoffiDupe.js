// One-off diagnostic: user reported a duplicate "Terem Moffi" transfer
// card, one showing "OGC Nizza" (Italian) and one "OGC Nice" (English/
// French) as the from-club -- same pattern as the earlier PSG/OM dupe
// this session (clubs.aliases missing a language variant, so
// resolveClub() fails for one of them and the two rows never dedupe).
// Read-only, no DB writes.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();

  const { data: transfers, error } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, from_club_id, to_club_id, source, external_id, published_at')
    .ilike('player_name', '%Moffi%');
  if (error) throw error;

  console.log(`--- ${transfers.length} transfer row(s) matching "Moffi" ---`);
  console.log(JSON.stringify(transfers, null, 2));

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, league_id, name, short_code, short_name, aliases')
    .or('name.ilike.%Nice%,name.ilike.%Nizza%,aliases.cs.{Nice},aliases.cs.{Nizza}');
  if (clubsErr) throw clubsErr;

  console.log('--- Candidate "Nice"/"Nizza" club rows ---');
  console.log(JSON.stringify(clubs, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
