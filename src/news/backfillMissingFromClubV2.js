import { getSupabaseClient } from '../db/supabaseClient.js';
import { normalize } from '../util/normalize.js';

// Second pass of the from_club backfill (see the first, already-run
// backfillMissingFromClub.js), using the improved squad lookup that also
// tries a surname-suffix match when extraction only produced a bare
// surname (e.g. "Ricci" vs squad_memberships' "samuele ricci") -- the
// exact-match-only version of this backfill silently skipped every row
// like that as "no data" the first time around.
async function lookupSquadClubId(supabase, playerName) {
  const normName = normalize(playerName);
  const { data: exactRows, error: exactErr } = await supabase
    .from('squad_memberships')
    .select('club_id')
    .eq('normalized_name', normName)
    .limit(2);
  if (exactErr) throw exactErr;
  if (exactRows.length === 1) return exactRows[0].club_id;
  if (exactRows.length > 1 || normName.includes(' ')) return null;

  const { data: suffixRows, error: suffixErr } = await supabase
    .from('squad_memberships')
    .select('club_id')
    .ilike('normalized_name', `% ${normName}`)
    .limit(2);
  if (suffixErr) throw suffixErr;
  return suffixRows.length === 1 ? suffixRows[0].club_id : null;
}

async function run() {
  const supabase = getSupabaseClient();

  const { data: rows, error } = await supabase
    .from('transfers')
    .select('id, player_id, player_name, to_club_id, to_club')
    .is('from_club', null)
    .not('player_id', 'is', null)
    .not('to_club_id', 'is', null);
  if (error) throw error;
  console.log(`found ${rows.length} candidate rows (from_club null, player_id + to_club_id set)`);

  const { data: players, error: playersErr } = await supabase
    .from('players')
    .select('id, name')
    .in('id', rows.map((r) => r.player_id));
  if (playersErr) throw playersErr;
  const nameById = new Map(players.map((p) => [p.id, p.name]));

  let updated = 0;
  let skippedSameAsDestination = 0;
  let skippedNoData = 0;

  for (const row of rows) {
    const playerName = nameById.get(row.player_id) || row.player_name;
    if (!playerName) {
      skippedNoData += 1;
      continue;
    }
    const clubId = await lookupSquadClubId(supabase, playerName);
    if (clubId == null) {
      skippedNoData += 1;
      continue;
    }
    if (clubId === row.to_club_id) {
      skippedSameAsDestination += 1;
      continue;
    }
    const { data: club, error: clubErr } = await supabase.from('clubs').select('id, name').eq('id', clubId).single();
    if (clubErr || !club) {
      skippedNoData += 1;
      continue;
    }
    const { error: updateErr } = await supabase
      .from('transfers')
      .update({ from_club: club.name, from_club_id: club.id })
      .eq('id', row.id);
    if (updateErr) {
      console.error(`update failed for transfer ${row.id}:`, updateErr.message);
      continue;
    }
    console.log(`  updated "${playerName}": null -> ${club.name} -> ${row.to_club}`);
    updated += 1;
  }

  console.log(`\nupdated: ${updated}, skipped (squad already at destination): ${skippedSameAsDestination}, skipped (no data): ${skippedNoData}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('backfill failed:', err);
    process.exitCode = 1;
  });
