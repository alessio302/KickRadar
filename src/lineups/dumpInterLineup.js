import { getSupabaseClient } from '../db/supabaseClient.js';
import { getFixtureLineups } from './goalApiClient.js';
import { resolveGoalApiIds } from './syncLiveEvents.js';

// Temporary: fetch the raw (lineupPosition-ordered) lineup for Inter's
// most recent fixture (id 14, 3-5-2 vs whatever the away side played) to
// build a real HTML mockup contrasting the current 4-broad-category row
// grouping against a formation-string + lineupPosition-driven one.
async function main() {
  const supabase = getSupabaseClient();
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at, status')
    .eq('id', 14);

  const resolved = await resolveGoalApiIds(supabase, fixtures);
  const info = resolved.get(14);
  console.log('Resolved:', info);

  const lineups = await getFixtureLineups(info.goalApiId);
  console.log('homeFormation:', lineups.homeFormation, 'awayFormation:', lineups.awayFormation);
  for (const side of ['home', 'away']) {
    console.log(
      `\n${side.toUpperCase()} raw startingLineups (sorted by lineupPosition):`,
      JSON.stringify(
        (lineups[side]?.startingLineups ?? [])
          .slice()
          .sort((a, b) => Number(a.lineupPosition) - Number(b.lineupPosition))
          .map((p) => ({
            lineupPosition: p.lineupPosition,
            name: p.lineupPlayer,
            number: p.lineupNumber,
            playerPosition: p.playerPosition,
            photo: p.playerImage,
          })),
        null,
        2
      )
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
