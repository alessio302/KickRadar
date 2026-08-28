// One-off: the user found ANOTHER Vitinha/PSG mismatch card (Vitinha shown
// as PSG -> Stade Rennais, but the real footmercato article is about the
// unrelated Genoa-based ex-Marseille Vitinha wanted by Rennes). Need to know
// whether this row predates the "bare single-word names aren't trusted for
// squad correction" fix (commit 8729f52, 2026-08-28 09:22:29Z) -- in which
// case it's the same stale row the fix can't retroactively touch -- or
// whether it was written AFTER that fix, which would mean the guard itself
// has a bug. Read-only, no DB writes.
import { getSupabaseClient } from '../db/supabaseClient.js';

const FIX_DEPLOYED_AT = new Date('2026-08-28T09:22:29Z');

async function main() {
  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, from_club_id, to_club_id, source, source_url, published_at, created_at')
    .ilike('player_name', '%vitinha%');
  if (error) throw error;

  for (const row of rows) {
    const createdAt = new Date(row.created_at);
    console.log(JSON.stringify(row, null, 2));
    console.log(`created_at is ${createdAt < FIX_DEPLOYED_AT ? 'BEFORE' : 'AFTER'} the fix (${FIX_DEPLOYED_AT.toISOString()})`);
    console.log('---');
  }
  console.log(`${rows.length} row(s) total.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
