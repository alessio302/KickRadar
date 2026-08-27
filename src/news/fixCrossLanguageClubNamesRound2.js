// Second pass, triggered by a reported "Estrasburgo" (Spanish for
// Strasbourg) leaking through unnormalized in a LaLiga-filtered card --
// the first cross-language alias pass this session missed it and several
// other real exonyms. This time every club across all 5 leagues was
// re-reviewed specifically for well-established city-name exonyms any of
// our 5 sources could plausibly use (not just the reporting source's own
// league), erring toward including a real, low-collision-risk alias
// rather than repeating the same kind of miss.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { resolveClub } from './clubMatch.js';
import { normalize } from '../util/normalize.js';

const ALIAS_ADDITIONS = {
  75: ['Strasburgo', 'Straßburg', 'Estrasburgo'], // RC Strasbourg Alsace -- the reported case
  65: ['Lione'], // Olympique Lyonnais
  34: ['Francoforte', 'Francfort', 'Fráncfort'], // Eintracht Frankfurt
  29: ['Brema', 'Brême'], // SV Werder Bremen
  38: ['Lipsia'], // RB Leipzig
  32: ['Friburgo'], // SC Freiburg
  30: ['Magonza', 'Mayence', 'Maguncia'], // 1. FSV Mainz 05
  309: ['Barcellona'], // FC Barcelona (Italian double-L spelling)
  31: ['Augusta'], // FC Augsburg
  318: ['Valence'], // Valencia CF (French exonym)
};

async function main() {
  const supabase = getSupabaseClient();

  console.log('--- Step 1: add cross-language aliases ---');
  for (const [id, additions] of Object.entries(ALIAS_ADDITIONS)) {
    const { data: club, error: readErr } = await supabase.from('clubs').select('id, name, aliases').eq('id', id).single();
    if (readErr) throw readErr;
    const merged = Array.from(new Set([...(club.aliases || []), ...additions]));
    const { error: writeErr } = await supabase.from('clubs').update({ aliases: merged }).eq('id', id);
    if (writeErr) throw writeErr;
    console.log(`club ${id} (${club.name}): aliases -> ${JSON.stringify(merged)}`);
  }

  console.log('--- Step 2: backfill unresolved from_club/to_club against the updated aliases ---');
  const { data: clubs, error: clubsErr } = await supabase.from('clubs').select('id, name, short_name, aliases');
  if (clubsErr) throw clubsErr;

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

  console.log('--- Step 3: normalize display text on rows whose club_id already resolved but text still differs ---');
  // Distinct from Step 2 (which only touches null-id rows): "Estrasburgo"
  // itself already showed a resolved club_id could still carry stale raw
  // text if a PRIOR pass resolved the id but a later text-only mismatch
  // slipped by -- belt and suspenders, cheap to check.
  const { data: resolved, error: resolvedErr } = await supabase
    .from('transfers')
    .select('id, from_club, from_club_id, to_club, to_club_id')
    .not('from_club_id', 'is', null)
    .not('to_club_id', 'is', null);
  if (resolvedErr) throw resolvedErr;
  const clubById = new Map(clubs.map((c) => [c.id, c]));
  let textFixed = 0;
  for (const row of resolved) {
    const updates = {};
    const fromClub = clubById.get(row.from_club_id);
    if (fromClub && row.from_club !== fromClub.name) updates.from_club = fromClub.name;
    const toClub = clubById.get(row.to_club_id);
    if (toClub && row.to_club !== toClub.name) updates.to_club = toClub.name;
    if (Object.keys(updates).length === 0) continue;
    const { error: updateErr } = await supabase.from('transfers').update(updates).eq('id', row.id);
    if (updateErr) throw updateErr;
    textFixed += 1;
    console.log(`transfer ${row.id}: normalized display text -> ${JSON.stringify(updates)}`);
  }
  console.log(`Normalized display text on ${textFixed} row(s).`);

  console.log('--- Step 4: dedup sweep (player_name + from_club_id + to_club_id, both ids set) ---');
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
    const [keep, ...dupes] = rows;
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
