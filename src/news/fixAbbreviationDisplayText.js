import { getSupabaseClient } from '../db/supabaseClient.js';

// Follow-up to fixClubAbbreviations.js: that script correctly backfilled
// from_club_id/to_club_id on rows still holding raw "PSG"/"OM" text, but
// only updated the *_id columns, not the from_club/to_club *text* columns
// the frontend actually displays (TransfersTab.jsx renders transfer.
// from_club/to_club directly, not a clubsById lookup by id -- confirmed
// live: the surviving Barcola card still read "PSG", not "Paris
// Saint-Germain FC", after that fix). New rows from the scraper itself
// don't have this problem (finalFromClub = resolvedFromMatch.name is used
// for both the id and the text column together at insert time) -- this
// only affects rows that abbreviation backfill touched.
const ABBREVIATIONS = ['PSG', 'OM'];

async function run() {
  const supabase = getSupabaseClient();

  for (const abbrev of ABBREVIATIONS) {
    for (const column of ['from_club', 'to_club']) {
      const idColumn = column === 'from_club' ? 'from_club_id' : 'to_club_id';
      const { data: rows, error } = await supabase
        .from('transfers')
        .select(`id, ${column}, ${idColumn}`)
        .eq(column, abbrev)
        .not(idColumn, 'is', null);
      if (error) throw error;
      for (const row of rows) {
        const clubId = row[idColumn];
        const { data: club, error: clubErr } = await supabase.from('clubs').select('name').eq('id', clubId).single();
        if (clubErr || !club) {
          console.error(`  could not resolve club id ${clubId} for transfer ${row.id}:`, clubErr?.message);
          continue;
        }
        const { error: updateErr } = await supabase.from('transfers').update({ [column]: club.name }).eq('id', row.id);
        if (updateErr) {
          console.error(`  update failed for ${row.id}:`, updateErr.message);
          continue;
        }
        console.log(`  transfer ${row.id}: ${column} "${abbrev}" -> "${club.name}"`);
      }
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('fix failed:', err);
    process.exitCode = 1;
  });
