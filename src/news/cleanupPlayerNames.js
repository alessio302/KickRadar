// One-off cleanup, not part of the regular pipeline. Removes the garbage
// "player" rows produced by the now-removed regex-fallback name-guessing
// heuristic (see extract.js) -- confirmed live via diagnosePlayerNames.js:
// club names ("Arsenal", "Bayern"), page/section fragments ("Hier
// FootballMercato", "ExclusivitéMercatoINFO RMC Sport"), generic words
// ("Der Junge", "Worse", "Pourquoi"), and even non-football sportspeople
// that leaked in before the Sky Sports sitemap fix (Verstappen, Hamilton,
// McIlroy).
//
// Conservative on purpose: a name is only deleted when it's NOT an exact
// match against a real, currently-synced squad player AND it trips one of
// a small set of high-confidence garbage signals (exact match against a
// known club name, contains a known non-name marker word/phrase, or is 4+
// words -- real player names are essentially never that long). Everything
// else is left alone and printed under "uncertain" for manual review
// rather than guessed at.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { normalize } from '../util/normalize.js';

// Substrings that only ever show up in page/section fragments or non-name
// boilerplate, never inside an actual player's name -- confirmed against
// the real garbage rows found live.
const GARBAGE_SUBSTRINGS = [
  'mercato', 'football', 'hier ', 'exclusivite', 'info rmc', 'calciomercato',
  'transferts', 'transfer', 'laliga', ' ligue', 'premier league', ' serie',
  'bundesliga', 'championship', 'grand prix', ' gp', 'pga tour', 'us open',
  ' ecb', 'super league', 'scottish premiership', 'league one', 'somerset',
  'woodland', 'verstappen', 'mcilroy', 'hamilton', 'dutch gp', 'nexo',
  'kabinen-rede', 'vergleich', 'stammverein', 'teamrat',
];

// Standalone connector/function words (German/French/Italian/English) that
// never appear as a word inside a real person's name.
const GARBAGE_WORDS = new Set(
  [
    'der', 'die', 'das', 'ich', 'in', 'se', 'pas', 'tout', 'pourquoi', 'non',
    'il', 'so', 'abbiamo', 'quel', 'prova', 'worse', 'incredible', 'late',
    'frustrated', 'brilliant', 'experimental', 'dominantes', 'entre', 'ses',
    'nous', 'la', 'le', 'quello', 'orribili',
  ].map(normalize)
);

function isGarbage(name, clubNameSet) {
  const norm = normalize(name);
  if (clubNameSet.has(norm)) return true;
  if (GARBAGE_SUBSTRINGS.some((s) => norm.includes(s))) return true;

  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 4) return true;
  if (words.some((w) => GARBAGE_WORDS.has(normalize(w)))) return true;

  return false;
}

async function main() {
  const supabase = getSupabaseClient();

  const { data: players, error } = await supabase.from('players').select('id, name, normalized_name');
  if (error) throw error;

  const { data: clubs, error: clubsErr } = await supabase.from('clubs').select('name');
  if (clubsErr) throw clubsErr;
  const clubNameSet = new Set(clubs.map((c) => normalize(c.name)));

  const { data: squadRows, error: squadErr } = await supabase.from('squad_memberships').select('normalized_name');
  if (squadErr) throw squadErr;
  const squadNameSet = new Set(squadRows.map((r) => r.normalized_name));

  const confirmedReal = [];
  const confirmedGarbage = [];
  const uncertain = [];

  for (const p of players) {
    if (squadNameSet.has(p.normalized_name)) {
      confirmedReal.push(p);
    } else if (isGarbage(p.name, clubNameSet)) {
      confirmedGarbage.push(p);
    } else {
      uncertain.push(p);
    }
  }

  console.log(`Total: ${players.length}`);
  console.log(`Confirmed real (squad match): ${confirmedReal.length}`);
  console.log(`Confirmed garbage (to delete): ${confirmedGarbage.length}`);
  console.log(`Uncertain (left alone): ${uncertain.length}`);

  console.log('\n--- Confirmed garbage ---');
  for (const p of confirmedGarbage) console.log(`  ${p.id}\t${p.name}`);

  console.log('\n--- Uncertain (not deleted, needs a human look) ---');
  for (const p of uncertain) console.log(`  ${p.id}\t${p.name}`);

  if (confirmedGarbage.length === 0) {
    console.log('\nNothing to delete.');
    return;
  }

  if (process.env.EXECUTE !== 'true') {
    console.log('\nDry run only (set EXECUTE=true to actually delete the list above). Nothing was changed.');
    return;
  }

  const garbageIds = confirmedGarbage.map((p) => p.id);

  const { error: clearErr } = await supabase
    .from('transfers')
    .update({ player_id: null, player_name: null })
    .in('player_id', garbageIds);
  if (clearErr) throw clearErr;

  const { error: deleteErr } = await supabase.from('players').delete().in('id', garbageIds);
  if (deleteErr) throw deleteErr;

  console.log(`\nDeleted ${garbageIds.length} garbage player rows and cleared them from any linked transfers.`);
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exitCode = 1;
});
