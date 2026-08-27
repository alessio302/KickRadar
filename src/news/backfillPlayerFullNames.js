import { getSupabaseClient } from '../db/supabaseClient.js';
import { normalize } from '../util/normalize.js';

// One-off backfill: transfers.player_name rows that are just a bare
// surname (no space) get upgraded to the real full name from
// squad_memberships when unambiguous -- same source/logic as
// lookupSquadMembership() in runNewsScraper.js, applied retroactively to
// rows created before that enrichment existed. Does NOT touch the shared
// `players` table (a bare surname there could legitimately belong to a
// different real person elsewhere in the data -- see runNewsScraper.js's
// own comment on why player-name fuzzy-matching was rejected for that
// table); this only corrects the per-transfer display name, which we've
// already disambiguated via that specific transfer's own to_club.
async function run() {
  const supabase = getSupabaseClient();

  const { data: rows, error } = await supabase.from('transfers').select('id, player_name').not('player_name', 'is', null);
  if (error) throw error;

  const candidates = rows.filter((r) => !r.player_name.includes(' '));
  console.log(`${rows.length} rows with player_name set, ${candidates.length} are bare surnames (no space)`);

  let updated = 0;
  let skippedAmbiguous = 0;

  for (const row of candidates) {
    const normName = normalize(row.player_name);
    const { data: matches, error: matchErr } = await supabase
      .from('squad_memberships')
      .select('player_name, club_id')
      .ilike('normalized_name', `% ${normName}`)
      .limit(2);
    if (matchErr) {
      console.error(`lookup failed for "${row.player_name}":`, matchErr.message);
      continue;
    }
    if (matches.length !== 1) {
      skippedAmbiguous += 1;
      continue;
    }
    const { error: updateErr } = await supabase
      .from('transfers')
      .update({ player_name: matches[0].player_name })
      .eq('id', row.id);
    if (updateErr) {
      console.error(`update failed for transfer ${row.id}:`, updateErr.message);
      continue;
    }
    console.log(`  updated "${row.player_name}" -> "${matches[0].player_name}"`);
    updated += 1;
  }

  console.log(`\nupdated: ${updated}, skipped (ambiguous or no match): ${skippedAmbiguous}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('backfill failed:', err);
    process.exitCode = 1;
  });
