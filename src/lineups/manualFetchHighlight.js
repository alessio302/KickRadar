// One-off: manually attach a highlight video to a single fixture, to test
// the feature end-to-end without waiting for syncHighlights.js's own 7-day
// lookback window (this fixture is older than that) or a real match to
// finish during this session. Removed again after use.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { getMatchVideos } from './goalApiClient.js';
import { resolveGoalApiIds } from './syncLiveEvents.js';

const FIXTURE_ID = 252; // Inter vs Monza, 2026-08-22

async function main() {
  const supabase = getSupabaseClient();
  const { data: fixture, error } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at, status')
    .eq('id', FIXTURE_ID)
    .single();
  if (error) throw error;

  const resolved = await resolveGoalApiIds(supabase, [fixture]);
  const info = resolved.get(fixture.id);
  console.log('Resolved GOAL API info:', info);
  if (!info) {
    console.log('Could not resolve this fixture to a GOAL API match id.');
    return;
  }

  const videos = await getMatchVideos(info.goalApiId);
  console.log('Videos found:', JSON.stringify(videos, null, 2));

  const url = videos[0]?.url ?? null;
  const { error: updateErr } = await supabase
    .from('fixtures')
    .update({ highlight_video_url: url, highlight_checked_at: new Date().toISOString() })
    .eq('id', fixture.id);
  if (updateErr) throw updateErr;

  console.log(url ? `Attached: ${url}` : 'No video found for this fixture.');
}

main().catch((err) => {
  console.error('Manual highlight fetch failed:', err);
  process.exitCode = 1;
});
