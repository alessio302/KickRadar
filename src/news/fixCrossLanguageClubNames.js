// One-off fix, triggered by a reported duplicate ("OGC Nizza" vs "OGC
// Nice" for the same Terem Moffi transfer): resolveClub() only matches a
// club's curated name/aliases, and clubs.aliases was empty for every club
// except PSG/OM (fixed in an earlier session). A news source using a
// foreign-language rendering of a club's home city (Italian "Nizza" for
// Nice, German "Neapel" for Napoli, ...) then fails to resolve at all,
// leaving from_club_id/to_club_id null on that row -- which breaks the
// dedup match key (player|from_club_id|to_club_id) against a differently-
// worded article about the same real transfer, producing exactly the
// visible duplicate reported.
//
// Scope, per the user's ask to check this "across languages": every
// curated club across the 5 leagues was reviewed (diagnoseAllClubNames.js)
// for a real, well-established cross-language exonym one of our 5 sources
// (tuttomercatoweb IT, kicker DE, skysports EN, rmcsport FR, marca ES)
// could plausibly use. Deliberately conservative -- only adding names with
// genuine linguistic backing, not speculative guesses; "Monaco di Baviera"
// for Bayern is safe alongside AS Monaco FC's own name because
// resolveClub()'s length-closest tiebreak (see clubMatch.js) already
// prefers "AS Monaco FC" for a bare "Monaco" candidate.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { resolveClub } from './clubMatch.js';
import { normalize } from '../util/normalize.js';

const ALIAS_ADDITIONS = {
  64: ['Nizza', 'Niza'], // OGC Nice
  25: ['Munich', 'Múnich', 'Monaco di Baviera'], // FC Bayern München
  12: ['Naples', 'Neapel', 'Nápoles'], // SSC Napoli
  322: ['Siviglia', 'Séville'], // Sevilla FC
  17: ['Turin', 'Turín'], // Torino FC
  61: ['Marsiglia', 'Marsella'], // Olympique de Marseille (already has "OM")
  21: ['Cologne', 'Colonia'], // 1. FC Köln
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
  const { data: clubs, error: clubsErr } = await supabase.from('clubs').select('id, name, aliases');
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

  console.log('--- Step 3: dedup sweep (player_name + from_club_id + to_club_id, both ids set) ---');
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
