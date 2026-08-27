import { getSupabaseClient } from '../db/supabaseClient.js';

// Read-only diagnostic for a reported bad card: "Julián Álvarez, Club
// Atlético de Madrid -> RCD Espanyol de Barcelona" -- Álvarez is a real
// Atlético striker, but a move to Espanyol (a much smaller club) is
// implausible on its face. Need the actual stored row (source_url, summary,
// player_id, to_club_id, created_at) to tell whether this is a bad LLM
// extraction, a bad club resolution, or a bad dedup merge folding two
// different stories together.
async function run() {
  const supabase = getSupabaseClient();

  const { data: rows, error } = await supabase
    .from('transfers')
    .select('id, player_id, player_name, from_club, from_club_id, to_club, to_club_id, source, source_url, summary, is_official, published_at, created_at')
    .ilike('player_name', '%lvarez%')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  console.log(`found ${rows.length} rows with player_name matching "%lvarez%"`);
  for (const r of rows) {
    console.log(JSON.stringify(r, null, 2));
  }

  // Also check whether a DIFFERENT player's row shares the same
  // source_url/summary -- would indicate a merge picked the wrong existing
  // candidate.
  if (rows.length > 0) {
    const targetSourceUrl = rows[0].source_url;
    const { data: sameUrlRows, error: urlErr } = await supabase
      .from('transfers')
      .select('id, player_name, from_club, to_club, source_url, created_at')
      .eq('source_url', targetSourceUrl);
    if (urlErr) throw urlErr;
    console.log(`\nother transfers rows sharing source_url "${targetSourceUrl}":`, sameUrlRows.length);
    for (const r of sameUrlRows) console.log(' ', JSON.stringify(r));
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('diagnostic failed:', err);
    process.exit(1);
  });
