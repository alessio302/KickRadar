// One-off diagnostic, not part of the regular pipeline. Dumps every
// stored player's name so the obviously-garbage ones produced by the now-
// removed regex-fallback name-guessing heuristic (see extract.js) can be
// identified for a targeted cleanup, rather than guessing at a detection
// rule that might delete a real player by mistake.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();

  const { data: players, error } = await supabase
    .from('players')
    .select('id, name, resolved_at')
    .order('name', { ascending: true });
  if (error) throw error;

  console.log(`${players.length} players total:\n`);
  for (const p of players) {
    console.log(`${p.id}\t${p.name}`);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
