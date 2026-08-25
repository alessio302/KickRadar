import { getSupabaseClient } from '../db/supabaseClient.js';
import { normalize } from '../util/normalize.js';

// One-off cleanup for duplicate transfer rows that existed before
// runNewsScraper.js's dedup fix (see its own comment on `duplicateOf` for
// the root cause -- to_club_id null for non-curated destinations, and
// from_club null vs "" mishandling). Same grouping key as the live dedup
// check: player_id + from_club (exact, NULL-aware) + to_club (punctuation/
// diacritic-insensitive). Within each group, keeps the most-recently-
// published row (freshest summary/source_url) and folds is_official into
// it (true if ANY row in the group was official), then deletes the rest --
// mirrors exactly what the live merge path does for a new duplicate.
function dedupeKey(text) {
  return normalize(text || '').replace(/[^a-z0-9]/g, '');
}

async function run() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('transfers')
    .select('id, player_id, player_name, from_club, to_club, published_at, is_official')
    .not('player_id', 'is', null)
    .order('published_at', { ascending: true });
  if (error) throw error;

  const groups = new Map();
  for (const row of data) {
    const key = `${row.player_id}|${dedupeKey(row.from_club)}|${dedupeKey(row.to_club)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let groupsMerged = 0;
  let rowsDeleted = 0;
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    groupsMerged += 1;

    const keeper = rows[rows.length - 1]; // latest published_at (rows pre-sorted ascending)
    const anyOfficial = rows.some((r) => r.is_official);
    const toDelete = rows.filter((r) => r.id !== keeper.id).map((r) => r.id);

    console.log(
      `Merging ${rows.length} rows for player_id=${keeper.player_id} (${keeper.player_name}) "${keeper.from_club}" -> "${keeper.to_club}": keeping ${keeper.id}, deleting ${toDelete.join(', ')}`
    );

    if (anyOfficial !== keeper.is_official) {
      const { error: updateErr } = await supabase.from('transfers').update({ is_official: true }).eq('id', keeper.id);
      if (updateErr) console.error(`  failed to update is_official on ${keeper.id}:`, updateErr.message);
    }

    const { error: deleteErr } = await supabase.from('transfers').delete().in('id', toDelete);
    if (deleteErr) {
      console.error(`  failed to delete duplicates:`, deleteErr.message);
    } else {
      rowsDeleted += toDelete.length;
    }
  }

  console.log(`\nDone: ${groupsMerged} duplicate groups merged, ${rowsDeleted} rows deleted.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
