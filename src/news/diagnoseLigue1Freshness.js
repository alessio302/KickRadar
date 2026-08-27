// One-off diagnostic: user reports Ligue 1's newest transfer card shows
// "3 giorni fa" despite the most recent news-scraper run (2.5h before the
// report) having inserted 3 new ligue-1 rows. Checking whether those
// inserts genuinely have an old published_at (a source-side parsing
// issue) or whether something else (the recent dedup sweeps?) removed
// what should be the freshest cards. Read-only, no DB writes.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();

  const { data: league, error: leagueErr } = await supabase.from('leagues').select('id').eq('slug', 'ligue-1').single();
  if (leagueErr) throw leagueErr;

  const { data: transfers, error } = await supabase
    .from('transfers')
    .select('id, player_name, from_club, to_club, source, external_id, published_at, created_at')
    .eq('league_id', league.id)
    .order('published_at', { ascending: false })
    .limit(15);
  if (error) throw error;

  console.log(`--- Top 15 ligue-1 transfers by published_at desc ---`);
  const now = Date.now();
  for (const t of transfers) {
    const ageHours = ((now - new Date(t.published_at).getTime()) / 3600000).toFixed(1);
    const createdAgeHours = ((now - new Date(t.created_at).getTime()) / 3600000).toFixed(1);
    console.log(
      `${t.player_name} (${t.from_club} -> ${t.to_club}) | source=${t.source} | published_at=${t.published_at} (${ageHours}h ago) | created_at=${t.created_at} (${createdAgeHours}h ago) | ext=${t.external_id.slice(0, 12)}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
