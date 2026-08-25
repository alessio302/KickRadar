import { getSupabaseClient } from '../db/supabaseClient.js';

async function run() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('transfers')
    .select('id, player_id, player_name, from_club, to_club, published_at, source, is_official')
    .not('player_id', 'is', null)
    .order('player_id', { ascending: true })
    .order('published_at', { ascending: true });
  if (error) throw error;

  const groups = new Map();
  for (const row of data) {
    const key = `${row.player_id}|${row.from_club}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  function dedupeKey(text) {
    return (text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }

  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    const byTo = new Map();
    for (const r of rows) {
      const tk = dedupeKey(r.to_club);
      if (!byTo.has(tk)) byTo.set(tk, []);
      byTo.get(tk).push(r);
    }
    for (const [tk, dupes] of byTo) {
      if (dupes.length > 1) {
        console.log(`\nDUPLICATE GROUP: player_id=${dupes[0].player_id} (${dupes[0].player_name}) from="${dupes[0].from_club}" to~="${tk}"`);
        for (const d of dupes) console.log(`  id=${d.id} to="${d.to_club}" published_at=${d.published_at} source=${d.source} official=${d.is_official}`);
      }
    }
  }
}

run().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
