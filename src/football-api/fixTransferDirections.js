// One-off corrective pass, not part of the regular pipeline. Applies the
// same squad-based direction check that runNewsScraper.js now does on new
// items (see its comment) retroactively to transfers already stored before
// squad_memberships existed -- e.g. the live Facundo Medina case (two RMC
// Sport articles with the clubs in opposite order). Run once after the
// initial squads-sync.yml run; going forward the scraper corrects new
// items itself, so this shouldn't need to run again except after a data
// gap.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();

  const { data: transfers, error } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, from_club_id, to_club_id, players(normalized_name)')
    .not('from_club_id', 'is', null)
    .not('to_club_id', 'is', null)
    .not('player_id', 'is', null);
  if (error) throw error;

  console.log(`Checking ${transfers.length} transfers with both clubs and a resolved player...`);

  let flipped = 0;
  let skippedNoSignal = 0;

  for (const t of transfers) {
    const normalizedName = t.players?.normalized_name;
    if (!normalizedName) continue;

    const { data: squadRows, error: squadErr } = await supabase
      .from('squad_memberships')
      .select('club_id')
      .eq('normalized_name', normalizedName)
      .limit(2);
    if (squadErr) {
      console.error(`Squad lookup failed for "${t.player_name}":`, squadErr.message);
      continue;
    }
    if (squadRows.length !== 1) {
      skippedNoSignal += 1; // not in any synced squad, or ambiguous -- leave as-is
      continue;
    }

    const actualClubId = squadRows[0].club_id;
    if (actualClubId === t.to_club_id && actualClubId !== t.from_club_id) {
      console.log(`Flipping #${t.id} ${t.player_name}: "${t.from_club} -> ${t.to_club}" becomes "${t.to_club} -> ${t.from_club}"`);
      const { error: updateErr } = await supabase
        .from('transfers')
        .update({
          from_club_id: t.to_club_id,
          to_club_id: t.from_club_id,
          from_club: t.to_club,
          to_club: t.from_club,
        })
        .eq('id', t.id);
      if (updateErr) console.error(`Failed to flip #${t.id}:`, updateErr.message);
      else flipped += 1;
    }
  }

  console.log(`Done. Flipped ${flipped}, no clean squad signal for ${skippedNoSignal}.`);
}

main().catch((err) => {
  console.error('Fix pass failed:', err);
  process.exitCode = 1;
});
