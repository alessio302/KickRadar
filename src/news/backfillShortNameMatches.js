// One-off backfill, triggered by a reported duplicate ("Man City" vs
// "Manchester City FC" for the same Enzo Fernandez story): resolveClub()
// now also matches club.short_name (see clubMatch.js), so any existing
// transfer row that failed to resolve a colloquial name ("Man City",
// "Man United", "HSV", "Barça", "Atleti", "M'gladbach", ...) can now be
// backfilled -- and the duplicates that gap already produced, merged.
// Same shape as the earlier cross-language alias fix in this session.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { resolveClub } from './clubMatch.js';
import { normalize } from '../util/normalize.js';

async function main() {
  const supabase = getSupabaseClient();

  const { data: clubs, error: clubsErr } = await supabase.from('clubs').select('id, name, short_name, aliases');
  if (clubsErr) throw clubsErr;

  console.log('--- Step 1: backfill unresolved from_club/to_club against short_name ---');
  const { data: candidates, error: candErr } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, from_club_id, to_club_id')
    .or('from_club_id.is.null,to_club_id.is.null');
  if (candErr) throw candErr;

  let backfilled = 0;
  for (const row of candidates) {
    const updates = {};
    if (row.from_club_id == null && row.from_club) {
      const match = resolveClub(row.from_club, clubs);
      if (match) {
        updates.from_club_id = match.id;
        if (row.from_club !== match.name) updates.from_club = match.name;
      }
    }
    if (row.to_club_id == null && row.to_club) {
      const match = resolveClub(row.to_club, clubs);
      if (match) {
        updates.to_club_id = match.id;
        if (row.to_club !== match.name) updates.to_club = match.name;
      }
    }
    if (Object.keys(updates).length === 0) continue;
    const { error: updateErr } = await supabase.from('transfers').update(updates).eq('id', row.id);
    if (updateErr) throw updateErr;
    backfilled += 1;
    console.log(`transfer ${row.id} (${row.player_name}): ${JSON.stringify(updates)}`);
  }
  console.log(`Backfilled ${backfilled} row(s).`);

  console.log('--- Step 2: dedup sweep (player_name + from_club_id + to_club_id, both ids set) ---');
  const { data: all, error: allErr } = await supabase
    .from('transfers')
    .select('id, player_name, from_club_id, to_club_id, published_at')
    .not('from_club_id', 'is', null)
    .not('to_club_id', 'is', null)
    .order('published_at', { ascending: true });
  if (allErr) throw allErr;

  const groups = new Map();
  for (const row of all) {
    if (!row.player_name) continue;
    const key = `${normalize(row.player_name)}|${row.from_club_id}|${row.to_club_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let merged = 0;
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    const [keep, ...dupes] = rows; // earliest published_at first, per the ORDER BY above
    for (const dupe of dupes) {
      const { error: delErr } = await supabase.from('transfers').delete().eq('id', dupe.id);
      if (delErr) throw delErr;
      merged += 1;
      console.log(`Merged duplicate ${dupe.id} into ${keep.id} (${key})`);
    }
  }
  console.log(`Merged ${merged} duplicate row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
