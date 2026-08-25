import { getSupabaseClient } from '../db/supabaseClient.js';
import { normalize } from '../util/normalize.js';

// One-off: deletes existing transfers rows where from/to resolve to the
// same club (contract renewals etc. mis-extracted as transfers, see
// runNewsScraper.js's sameClub guard added right after this bug was
// found live -- "Sivera renueva hasta 2030" -> "Deportivo Alavés ->
// Deportivo Alavés"). Same comparison the new guard uses: by id when both
// sides have a club_id, else by dedupeKey() text.
function dedupeKey(text) {
  return normalize(text || '').replace(/[^a-z0-9]/g, '');
}

async function run() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, from_club_id, to_club, to_club_id');
  if (error) throw error;

  const toDelete = data.filter((row) => {
    if (row.from_club_id && row.to_club_id) return row.from_club_id === row.to_club_id;
    const fromKey = dedupeKey(row.from_club);
    return fromKey !== '' && fromKey === dedupeKey(row.to_club);
  });

  for (const row of toDelete) {
    console.log(`Deleting id=${row.id} player="${row.player_name}" "${row.from_club}" -> "${row.to_club}"`);
  }

  if (toDelete.length > 0) {
    const { error: deleteErr } = await supabase
      .from('transfers')
      .delete()
      .in('id', toDelete.map((r) => r.id));
    if (deleteErr) throw deleteErr;
  }

  console.log(`\nDone: ${toDelete.length} same-club rows deleted.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
