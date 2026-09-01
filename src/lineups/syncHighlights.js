// Attaches a highlight-clip URL (GOAL API's Videos resource,
// /videos/match/:matchId -- confirmed live coverage across all 5 tracked
// leagues via diagnoseVideoCoverage.js) to a finished fixture, and pushes
// whoever favorited it once one shows up.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { getMatchVideos } from './goalApiClient.js';
import { resolveGoalApiIds } from './syncLiveEvents.js';
import { sendPushToFixtureFavoriters } from '../push/sendPush.js';
import { pushStringsFor, SUPPORTED_PUSH_LANGUAGES } from '../push/pushI18n.js';

// How long to keep checking a finished fixture for a clip before giving
// up -- GOAL API's own sample data (diagnoseVideoCoverage.js) was all
// backfilled at once rather than trickling in per real match, so there's
// no confirmed real-world "how long after full time" figure to anchor
// this on; a week is generous enough to catch a slow post without
// checking long-dead fixtures forever.
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
// Throttles re-querying a fixture that doesn't have a clip yet -- no
// point re-asking GOAL API every run for the same miss.
const RECHECK_INTERVAL_MS = 30 * 60 * 1000;
// Keeps one run's GOAL API spend modest -- shares the same account-wide
// budget as lineups-sync/live-events/player-refresh (see
// playerProfileResolver.js's own MIN_GOAL_API_INTERVAL_MS comment).
const BATCH_SIZE = 15;
const CALL_SPACING_MS = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findCandidates(supabase) {
  const cutoff = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const recheckBefore = new Date(Date.now() - RECHECK_INTERVAL_MS).toISOString();
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at, status')
    .eq('status', 'finished')
    .is('highlight_video_url', null)
    .gte('kickoff_at', cutoff)
    .or(`highlight_checked_at.is.null,highlight_checked_at.lt.${recheckBefore}`)
    .order('kickoff_at', { ascending: false })
    .limit(BATCH_SIZE);
  if (error) throw error;
  return data;
}

function buildHighlightPayloads(fixtureId, leagueSlug, homeTeam, awayTeam) {
  const byLanguage = {};
  for (const lang of SUPPORTED_PUSH_LANGUAGES) {
    const s = pushStringsFor(lang).highlights;
    byLanguage[lang] = { title: s.title, body: `${homeTeam} - ${awayTeam}`, url: `/?league=${leagueSlug}&fixture=${fixtureId}` };
  }
  return byLanguage;
}

export async function syncHighlights() {
  const supabase = getSupabaseClient();
  const candidates = await findCandidates(supabase);
  if (candidates.length === 0) return { checked: 0, found: 0, pushed: 0 };

  const resolved = await resolveGoalApiIds(supabase, candidates);

  const { data: dbLeagues } = await supabase.from('leagues').select('id, slug');
  const leagueSlugById = new Map((dbLeagues ?? []).map((l) => [l.id, l.slug]));
  const { data: allClubs } = await supabase.from('clubs').select('id, name, short_name');
  const clubById = new Map((allClubs ?? []).map((c) => [c.id, c]));

  let checked = 0;
  let found = 0;
  let pushed = 0;

  for (const fixture of candidates) {
    const info = resolved.get(fixture.id);
    if (!info) {
      // Couldn't even resolve which GOAL API match this is -- mark
      // checked anyway so it isn't retried every single run forever, same
      // reasoning seen_news_items exists for in runNewsScraper.js.
      await supabase.from('fixtures').update({ highlight_checked_at: new Date().toISOString() }).eq('id', fixture.id);
      continue;
    }

    let videos = [];
    try {
      videos = await getMatchVideos(info.goalApiId);
    } catch (err) {
      console.error(`GOAL API videos lookup failed for fixture ${fixture.id}:`, err.message);
    }
    checked += 1;

    const url = videos[0]?.url ?? null;
    await supabase
      .from('fixtures')
      .update({ highlight_video_url: url, highlight_checked_at: new Date().toISOString() })
      .eq('id', fixture.id);

    if (url) {
      found += 1;
      const { count } = await supabase
        .from('favorite_fixtures')
        .select('id', { count: 'exact', head: true })
        .eq('fixture_id', fixture.id);

      if (count) {
        const leagueSlug = leagueSlugById.get(fixture.league_id);
        const homeTeam = clubById.get(fixture.home_club_id)?.short_name ?? clubById.get(fixture.home_club_id)?.name ?? '';
        const awayTeam = clubById.get(fixture.away_club_id)?.short_name ?? clubById.get(fixture.away_club_id)?.name ?? '';
        try {
          await sendPushToFixtureFavoriters(fixture.id, buildHighlightPayloads(fixture.id, leagueSlug, homeTeam, awayTeam));
          pushed += 1;
        } catch (err) {
          console.error(`Failed to push highlight for fixture ${fixture.id}:`, err.message);
        }
        // Cleared regardless of push success -- a favorite's only
        // remaining purpose after full time was this one notification
        // (see syncLiveScores.js's own comment on why it isn't cleared
        // right at full time instead); once attempted, nothing else will
        // ever use it again.
        const { error: favErr } = await supabase.from('favorite_fixtures').delete().eq('fixture_id', fixture.id);
        if (favErr) console.error(`Failed to clear favorites for fixture ${fixture.id}:`, favErr.message);
      }
    }

    await sleep(CALL_SPACING_MS);
  }

  return { checked, found, pushed };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncHighlights()
    .then((result) => console.log('Highlights sync complete:', result))
    .catch((err) => {
      console.error('Highlights sync failed:', err);
      process.exitCode = 1;
    });
}
