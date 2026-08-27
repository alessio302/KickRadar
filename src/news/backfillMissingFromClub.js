import { getSupabaseClient } from '../db/supabaseClient.js';
import { normalize } from '../util/normalize.js';

// One-off backfill for transfers rows stuck with from_club = null from
// before runNewsScraper.js learned to recover it via squad_memberships (see
// that change's comment). These rows are invisible in the app today --
// useTransfers.js requires both from_club and to_club non-null to display a
// card. Same logic as the new backend branch: if squad_memberships has the
// player at exactly one club other than the destination, that's their real
// prior club. Only touches rows that already have a player_id (needed to
// look up squad_memberships by normalized_name) and a non-null to_club_id.
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
  let skippedAmbiguous = 0;
  let skippedNoData = 0;

  for (const row of rows) {
    const playerName = nameById.get(row.player_id) || row.player_name;
    if (!playerName) {
      skippedNoData += 1;
      continue;
    }
    const { data: squadRows, error: squadErr } = await supabase
      .from('squad_memberships')
      .select('club_id')
      .eq('normalized_name', normalize(playerName))
      .limit(2);
    if (squadErr) {
      console.error(`squad lookup failed for "${playerName}":`, squadErr.message);
      continue;
    }
    if (squadRows.length !== 1) {
      skippedNoData += 1;
      continue;
    }
    if (squadRows[0].club_id === row.to_club_id) {
      // Squad sync already caught up to the destination club -- can't
      // recover the prior club from current-roster data alone.
      skippedAmbiguous += 1;
      continue;
    }
    const { data: club, error: clubErr } = await supabase
      .from('clubs')
      .select('id, name')
      .eq('id', squadRows[0].club_id)
      .single();
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

  console.log(`\nupdated: ${updated}, skipped (squad already at destination / no signal): ${skippedAmbiguous}, skipped (no data): ${skippedNoData}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('backfill failed:', err);
    process.exitCode = 1;
  });
