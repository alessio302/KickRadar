// One-off: corrects a handful of club short_name values that were the raw
// football-data.org `shortName` field verbatim but don't match how real
// standings tables/media actually display that club -- confirmed live via
// web research (fotmob/ESPN/flashscore/footmercato's own table pages, etc.)
// against each specific club below. Two clubs users originally flagged
// ("M'gladbach", "Como 1907") turned out to already be genuine, real-world
// short forms (confirmed via Sportschau's own live-ticker and multiple
// Italian sports sites respectively) and are deliberately left untouched.
//
// The colloquial forms this replaces ("Atleti", "Barça", bare "Celta",
// bare "Deportivo", bare "Santander") are still real things Spanish media
// write in headlines, so they're preserved in `aliases` rather than lost --
// extract.js/clubMatch.js match news text against name+short_name+aliases,
// so this only changes what's *displayed*, not what the scraper recognizes.
//
// short_name itself is NOT touched here for future syncs -- see
// syncClubs.js's SHORT_NAME_OVERRIDES, which is the durable fix; this
// script only needs to run once to update rows already in the DB so the
// UI shows the fix today instead of waiting for the next clubs-sync.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { SHORT_NAME_OVERRIDES } from './syncClubs.js';

// external_team_id -> extra alias to preserve (only where the old
// short_name was a real colloquial form worth keeping searchable).
const PRESERVE_AS_ALIAS = {
  78: 'Atleti',
  81: 'Barça',
  558: 'Celta',
  560: 'Deportivo',
  5335: 'Santander',
};

async function main() {
  const supabase = getSupabaseClient();
  const ids = Object.keys(SHORT_NAME_OVERRIDES).map(Number);

  const { data: rows, error: fetchErr } = await supabase
    .from('clubs')
    .select('id, external_team_id, name, short_name, aliases')
    .in('external_team_id', ids);
  if (fetchErr) throw fetchErr;

  for (const row of rows) {
    const newShortName = SHORT_NAME_OVERRIDES[row.external_team_id];
    const aliasToAdd = PRESERVE_AS_ALIAS[row.external_team_id];
    const aliases = row.aliases || [];
    const newAliases = aliasToAdd && !aliases.includes(aliasToAdd) ? [...aliases, aliasToAdd] : aliases;

    const { error: updateErr } = await supabase
      .from('clubs')
      .update({ short_name: newShortName, aliases: newAliases })
      .eq('id', row.id);
    if (updateErr) throw updateErr;

    console.log(`${row.name}: "${row.short_name}" -> "${newShortName}"${aliasToAdd ? ` (aliases now include "${aliasToAdd}")` : ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
