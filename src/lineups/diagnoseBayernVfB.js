import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, name, short_name, league_id')
    .or('name.ilike.%bayern%,name.ilike.%stuttgart%,short_name.ilike.%bayern%,short_name.ilike.%vfb%');
  if (clubsErr) throw clubsErr;
  console.log('Clubs:', clubs.map((c) => `${c.id}:${c.name} (${c.short_name})`).join(' | '));

  const bayern = clubs.find((c) => /bayern/i.test(c.name));
  const vfb = clubs.find((c) => /stuttgart/i.test(c.name));
  if (!bayern || !vfb) {
    console.log('Could not resolve both clubs.');
    return;
  }

  const { data: fixtures, error: fixErr } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at, status, events_synced_at')
    .or(
      `and(home_club_id.eq.${bayern.id},away_club_id.eq.${vfb.id}),and(home_club_id.eq.${vfb.id},away_club_id.eq.${bayern.id})`
    )
    .order('kickoff_at', { ascending: false })
    .limit(3);
  if (fixErr) throw fixErr;
  console.log('Fixtures:', JSON.stringify(fixtures, null, 2));

  for (const f of fixtures) {
    const { data: lineups, error: lErr } = await supabase
      .from('lineups')
      .select('fixture_id, club_id, confirmed, published_at, formation')
      .eq('fixture_id', f.id);
    if (lErr) throw lErr;
    console.log(`Lineups for fixture ${f.id} (kickoff ${f.kickoff_at}):`, JSON.stringify(lineups, null, 2));
  }

  const now = new Date();
  console.log('Now (UTC):', now.toISOString());
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
