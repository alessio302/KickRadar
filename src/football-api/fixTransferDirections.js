// One-off corrective pass, not part of the regular pipeline. Two phases:
//
// 1. Backfill from_club_id/to_club_id for rows stored before club
//    resolution covered all four leagues (runNewsScraper.js used to only
//    resolve against the scraping league's own clubs, so a cross-league
//    story -- e.g. Facundo Medina's Marseille/Leverkusen saga -- could
//    only ever get one side resolved; the other stayed null forever).
// 2. Apply the same squad-based direction check runNewsScraper.js now
//    does on new items: if a player's real current club (from synced
//    squad data) is the extracted *destination* rather than the
//    extracted origin, flip the stored row.
//
// Run once, after squads-sync.yml has synced real squad data; going
// forward both the club-resolution fix and the direction check apply to
// new items automatically.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { resolveClub } from '../news/clubMatch.js';

async function backfillClubIds(supabase, allClubs) {
  const { data: rows, error } = await supabase
    .from('transfers')
    .select('id, from_club, to_club, from_club_id, to_club_id')
    .or('from_club_id.is.null,to_club_id.is.null');
  if (error) throw error;

  console.log(`Phase 1: ${rows.length} rows with at least one unresolved club id.`);
  let backfilled = 0;
  for (const t of rows) {
    const fromMatch = t.from_club_id ? null : resolveClub(t.from_club, allClubs);
    const toMatch = t.to_club_id ? null : resolveClub(t.to_club, allClubs);
    if (!fromMatch && !toMatch) continue;

    const update = {};
    if (fromMatch) update.from_club_id = fromMatch.id;
    if (toMatch) update.to_club_id = toMatch.id;

    const { error: updateErr } = await supabase.from('transfers').update(update).eq('id', t.id);
    if (updateErr) {
      console.error(`Failed to backfill #${t.id}:`, updateErr.message);
      continue;
    }
    backfilled += 1;
  }
  console.log(`Phase 1 done: backfilled ${backfilled} rows.`);
}

async function fixDirections(supabase) {
  const { data: transfers, error } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, from_club_id, to_club_id, players(normalized_name)')
    .not('from_club_id', 'is', null)
    .not('to_club_id', 'is', null)
    .not('player_id', 'is', null);
  if (error) throw error;

  console.log(`Phase 2: checking ${transfers.length} transfers with both clubs and a resolved player...`);

  const { data: allClubs, error: allClubsErr } = await supabase.from('clubs').select('id, name');
  if (allClubsErr) throw allClubsErr;
  const clubNameById = new Map(allClubs.map((c) => [c.id, c.name]));

  let flipped = 0;
  let skippedNoSignal = 0;

  for (const t of transfers) {
    const normalizedName = t.players?.normalized_name;
    console.log(`\n#${t.id} "${t.player_name}" (normalized: "${normalizedName}"): "${t.from_club}" -> "${t.to_club}"`);
    if (!normalizedName) {
      console.log('  no players row linked, skipping');
      continue;
    }

    const { data: squadRows, error: squadErr } = await supabase
      .from('squad_memberships')
      .select('club_id')
      .eq('normalized_name', normalizedName)
      .limit(3);
    if (squadErr) {
      console.error(`  squad lookup failed:`, squadErr.message);
      continue;
    }
    console.log(
      `  squad match: ${squadRows.length} row(s) ->`,
      squadRows.map((r) => clubNameById.get(r.club_id) ?? r.club_id)
    );
    if (squadRows.length !== 1) {
      skippedNoSignal += 1; // not in any synced squad, or ambiguous -- leave as-is
      continue;
    }

    const actualClubId = squadRows[0].club_id;
    if (actualClubId !== t.from_club_id && actualClubId !== t.to_club_id) {
      console.log(`  real club is neither side of this story (a third club) -- leaving as-is, not something this pass corrects`);
      continue;
    }
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

  console.log(`Phase 2 done: flipped ${flipped}, no clean squad signal for ${skippedNoSignal}.`);
}

async function main() {
  const supabase = getSupabaseClient();

  const { data: allClubs, error: clubsErr } = await supabase.from('clubs').select('id, name, short_name, aliases, league_id');
  if (clubsErr) throw clubsErr;

  await backfillClubIds(supabase, allClubs);
  await fixDirections(supabase);
}

main().catch((err) => {
  console.error('Fix pass failed:', err);
  process.exitCode = 1;
});
