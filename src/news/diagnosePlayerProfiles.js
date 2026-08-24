// One-off diagnostic, not part of the regular pipeline. Checks how many
// already-resolved players in the `players` table actually got a real
// transfermarkt.de profile URL vs. silently fell back to the plain search
// URL -- following up on the finding that transfermarkt.de is now behind
// the same AWS WAF Bot Control challenge as kicker.de, which
// playerProfileResolver.js's existing scraping wouldn't have errored on
// (a 202 status passes fetch's `res.ok` check), just silently failed to
// find a profile link and fallen back.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();

  const { data: players, error } = await supabase
    .from('players')
    .select('id, name, transfermarkt_url, resolved_at')
    .order('resolved_at', { ascending: true });
  if (error) throw error;

  console.log(`${players.length} players in the table.`);

  const realProfile = players.filter((p) => p.transfermarkt_url?.includes('/profil/spieler/'));
  const searchFallback = players.filter((p) => p.transfermarkt_url?.includes('/schnellsuche/'));
  const other = players.filter(
    (p) => !p.transfermarkt_url?.includes('/profil/spieler/') && !p.transfermarkt_url?.includes('/schnellsuche/')
  );

  console.log(`Real profile URLs: ${realProfile.length}`);
  console.log(`Search-page fallback URLs: ${searchFallback.length}`);
  console.log(`Other/unexpected: ${other.length}`);

  console.log('\nOldest 5 resolved (earliest in the project):');
  for (const p of players.slice(0, 5)) {
    console.log(`  ${p.resolved_at} "${p.name}" -> ${p.transfermarkt_url}`);
  }
  console.log('\nNewest 5 resolved (most recent):');
  for (const p of players.slice(-5)) {
    console.log(`  ${p.resolved_at} "${p.name}" -> ${p.transfermarkt_url}`);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
