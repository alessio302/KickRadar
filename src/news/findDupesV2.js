import { getSupabaseClient } from '../db/supabaseClient.js';
import { normalize } from '../util/normalize.js';

// Read-only diagnostic: find existing transfers rows that are the same
// story under the *new* dedup logic (name-variant player match + matching
// destination club) but weren't caught at insert time because they
// predate the fix in runNewsScraper.js. Prints candidate groups; deletes
// nothing.

function dedupeKey(text) {
  return normalize(text || '').replace(/[^a-z0-9]/g, '');
}

function isNameVariant(a, b) {
  const wordsA = new Set(normalize(a || '').split(/\s+/).filter(Boolean));
  const wordsB = new Set(normalize(b || '').split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  const [smaller, bigger] = wordsA.size <= wordsB.size ? [wordsA, wordsB] : [wordsB, wordsA];
  return [...smaller].every((w) => bigger.has(w));
}

async function main() {
  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('transfers')
    .select('id, player_id, player_name, from_club, from_club_id, to_club, to_club_id, is_official, source, source_url, published_at');
  if (error) throw error;

  const fromKey = (r) => (r.from_club_id != null ? `id:${r.from_club_id}` : `txt:${dedupeKey(r.from_club)}`);
  const toKey = (r) => (r.to_club_id != null ? `id:${r.to_club_id}` : `txt:${dedupeKey(r.to_club)}`);

  const groups = new Map();
  for (const r of rows) {
    const key = `${fromKey(r)}|${toKey(r)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  let found = 0;
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (isNameVariant(a.player_name, b.player_name)) {
          found += 1;
          console.log('--- duplicate group ---', key);
          console.log(JSON.stringify(a, null, 2));
          console.log(JSON.stringify(b, null, 2));
        }
      }
    }
  }
  console.log(`Scanned ${rows.length} transfers, found ${found} duplicate pair(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
