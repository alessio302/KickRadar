import { getSupabaseClient } from '../db/supabaseClient.js';

// One-off fix for the reported Barcola duplicate ("Paris Saint-Germain FC"
// vs "PSG" as from_club never being recognized as the same club -- see
// clubMatch.js's resolveClub(), which already checks clubs.aliases but had
// nothing in it; confirmed live no sync script ever populates that
// column). Three steps:
//  1. Add the two abbreviations this project's own history has already
//     confirmed as real ("PSG", and "OM" per clubMatch.js's original
//     motivating bug) as aliases, so future stories resolve correctly.
//  2. Backfill from_club_id/to_club_id on existing rows still holding the
//     raw unresolved "PSG"/"OM" text now that the alias exists.
//  3. Merge any now-detectable duplicate pairs this caused (same player +
//     same from/to club pair, different rows) into one, same merge
//     semantics runNewsScraper.js's own dedup uses (keep the row, prefer
//     official, keep the newer published_at), deleting the redundant row.
const ABBREVIATIONS = [
  { alias: 'PSG', clubName: 'Paris Saint-Germain FC' },
  { alias: 'OM', clubName: 'Olympique de Marseille' },
];

async function run() {
  const supabase = getSupabaseClient();

  console.log('--- step 1: add aliases ---');
  const clubIdByAlias = {};
  for (const { alias, clubName } of ABBREVIATIONS) {
    const { data: club, error } = await supabase.from('clubs').select('id, name, aliases').eq('name', clubName).maybeSingle();
    if (error) throw error;
    if (!club) {
      console.log(`  no club found named "${clubName}", skipping`);
      continue;
    }
    clubIdByAlias[alias] = club.id;
    if (club.aliases.includes(alias)) {
      console.log(`  ${clubName} already has alias "${alias}"`);
      continue;
    }
    const { error: updateErr } = await supabase
      .from('clubs')
      .update({ aliases: [...club.aliases, alias] })
      .eq('id', club.id);
    if (updateErr) throw updateErr;
    console.log(`  added alias "${alias}" to ${clubName} (id ${club.id})`);
  }

  console.log('\n--- step 2: backfill from_club_id/to_club_id on rows still holding raw abbreviation text ---');
  let backfilled = 0;
  for (const alias of Object.keys(clubIdByAlias)) {
    const clubId = clubIdByAlias[alias];
    const { data: fromRows, error: fromErr } = await supabase
      .from('transfers')
      .select('id')
      .eq('from_club', alias)
      .is('from_club_id', null);
    if (fromErr) throw fromErr;
    for (const row of fromRows) {
      const { error } = await supabase.from('transfers').update({ from_club_id: clubId }).eq('id', row.id);
      if (error) console.error(`  failed to backfill from_club_id for ${row.id}:`, error.message);
      else backfilled += 1;
    }
    const { data: toRows, error: toErr } = await supabase.from('transfers').select('id').eq('to_club', alias).is('to_club_id', null);
    if (toErr) throw toErr;
    for (const row of toRows) {
      const { error } = await supabase.from('transfers').update({ to_club_id: clubId }).eq('id', row.id);
      if (error) console.error(`  failed to backfill to_club_id for ${row.id}:`, error.message);
      else backfilled += 1;
    }
  }
  console.log(`  backfilled ${backfilled} club_id value(s)`);

  console.log('\n--- step 3: find and merge now-detectable duplicates ---');
  const { data: allTransfers, error: allErr } = await supabase
    .from('transfers')
    .select('id, player_id, player_name, from_club_id, to_club_id, is_official, published_at, source_url, summary, source, created_at')
    .not('player_id', 'is', null)
    .not('from_club_id', 'is', null)
    .not('to_club_id', 'is', null);
  if (allErr) throw allErr;

  const groups = new Map();
  for (const t of allTransfers) {
    const key = `${t.player_id}|${t.from_club_id}|${t.to_club_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  let merged = 0;
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    group.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const keep = group[0];
    const rest = group.slice(1);
    const newestPublishedAt = group.reduce((max, t) => (new Date(t.published_at) > new Date(max) ? t.published_at : max), keep.published_at);
    const anyOfficial = group.some((t) => t.is_official);
    const { error: updateErr } = await supabase
      .from('transfers')
      .update({ published_at: newestPublishedAt, is_official: anyOfficial })
      .eq('id', keep.id);
    if (updateErr) {
      console.error(`  failed to update keeper ${keep.id}:`, updateErr.message);
      continue;
    }
    for (const dupe of rest) {
      const { error: deleteErr } = await supabase.from('transfers').delete().eq('id', dupe.id);
      if (deleteErr) {
        console.error(`  failed to delete duplicate ${dupe.id}:`, deleteErr.message);
        continue;
      }
      console.log(`  merged [${key}] "${dupe.player_name}" (${dupe.source}, ${dupe.id}) into ${keep.id} (${keep.source})`);
      merged += 1;
    }
  }
  console.log(`\nmerged ${merged} duplicate row(s)`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('fix failed:', err);
    process.exitCode = 1;
  });
