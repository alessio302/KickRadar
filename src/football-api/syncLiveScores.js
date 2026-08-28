import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getMatches, sleep, STATUS_MAP } from './client.js';

// Confirmed live (Bayern-Stuttgart, 2026-08-28): the global, multi-
// competition /matches endpoint (getMatchesForDate) silently returned 0
// matches all through a live Bundesliga matchday, while the per-competition
// /competitions/{id}/matches endpoint (same as syncFixtures.js already
// uses) correctly showed status=IN_PLAY with the real score at the same
// moment -- confirmed side by side in one diagnostic run. This had likely
// made every live-score update silently a no-op since the feature was
// built, not just for this one match: pollOnce() only ever saw whatever
// the global endpoint returned, and that was always empty. Switched to one
// per-competition call per league (5 calls/poll, 1500ms apart like
// syncFixtures.js's own loop) -- more requests per poll, but still
// comfortably inside the free tier's 10 req/min cap.
//
// Free tier: 10 req/min, shared across every football-data.org caller in
// the repo -- head-to-head-sync.js in particular already runs itself at
// ~9.2 req/min whenever it's active (4x/day, short windows), so an overlap
// with that job can still push the shared account-wide total over the cap
// even with this file's own rate kept modest. 30s between polls keeps
// pollOnce's own sustained rate to roughly 8 req/min; pollOnce() below is
// resilient to a single league's request failing (a 429 from exactly that
// kind of overlap, or any transient error) so a rate-limit hit skips just
// that league for one cycle instead of aborting the whole 13-minute loop.
const POLL_INTERVAL_MS = 30_000;

// Bounded below the workflow's own 15-min job timeout so the process exits
// cleanly on its own before GitHub Actions would kill it mid-request, and
// below the outer schedule's 15-min cadence so consecutive runs don't
// overlap.
const JOB_BUDGET_MS = 13 * 60 * 1000;

// How long before kickoff to start polling -- a scheduled fixture flips to
// IN_PLAY sometime around its kickoff_at, not exactly on it (added time,
// late starts), so this needs some slack either side.
const UPCOMING_WINDOW_MS = 10 * 60 * 1000;

// Confirmed live (Bayern-Stuttgart, 2026-08-28): a run that starts right at
// kickoff_at can catch football-data.org before it has flipped the match to
// IN_PLAY yet -- its own status update lags kickoff by up to a few minutes.
// Without this, that fixture's kickoff_at is already in the past, so it no
// longer counts as "starting soon" and the loop exits after that one
// premature poll, never coming back until a whole separate job invocation
// happens to run again. Symmetric slack on the past side keeps polling for
// a fixture that's still "scheduled" in our own data shortly after its
// kickoff, giving the source time to catch up within the same job run.
const RECENT_KICKOFF_WINDOW_MS = 15 * 60 * 1000;

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

// Live and about-to-start are two different signals: whether to keep
// polling *today's whole match list* (cheap: still just one request) is
// its own question from whether to keep the *loop* alive waiting for the
// next kickoff. A scheduled fixture within the window means "worth
// waiting", independent of whether anything is live played right now.
async function hasFixtureStartingSoon(supabase) {
  const now = new Date();
  const recently = new Date(now.getTime() - RECENT_KICKOFF_WINDOW_MS).toISOString();
  const soon = new Date(now.getTime() + UPCOMING_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from('fixtures')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'scheduled')
    .gte('kickoff_at', recently)
    .lte('kickoff_at', soon);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// Deliberately not scoped to status=LIVE -- a match that just finished
// would silently drop out of that filter on the very next poll, leaving
// its final score/status un-written until the next 4x-daily fixtures-sync
// run (hours later) instead of within this same ~75s cycle. Fetching each
// league's full match list once and updating every live-or-finished row in
// it catches that transition for free, no cross-poll state needed.
async function pollOnce(supabase) {
  const date = toDateString(new Date());
  const matches = [];
  for (const league of LEAGUES) {
    try {
      const leagueMatches = await getMatches({ competitionId: league.externalCompetitionId, dateFrom: date, dateTo: date });
      matches.push(...leagueMatches);
    } catch (err) {
      // A single league's request failing (rate limit, transient network
      // error) shouldn't cost the whole poll -- the other 4 leagues' data
      // is still worth writing, and the next poll (30s away) tries this
      // league again anyway.
      console.error(`Failed to fetch live matches for ${league.slug}:`, err.message);
    }
    await sleep(1500); // stay well under the free tier's 10 req/min, same spacing as syncFixtures.js
  }

  let updated = 0;
  let stillLive = false;

  for (const m of matches) {
    if (m.status === 'IN_PLAY' || m.status === 'PAUSED') stillLive = true;
    if (m.status !== 'IN_PLAY' && m.status !== 'PAUSED' && m.status !== 'FINISHED') continue;

    const { error } = await supabase
      .from('fixtures')
      .update({
        status: STATUS_MAP[m.status] || 'live',
        home_score: m.score?.fullTime?.home ?? null,
        away_score: m.score?.fullTime?.away ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('external_fixture_id', m.id);
    if (error) console.error(`Failed to update live score for match ${m.id}:`, error.message);
    else updated += 1;
  }

  return { updated, stillLive };
}

export async function syncLiveScores() {
  const supabase = getSupabaseClient();
  const deadline = Date.now() + JOB_BUDGET_MS;
  let polls = 0;
  let totalUpdated = 0;

  while (Date.now() < deadline) {
    const { updated, stillLive } = await pollOnce(supabase);
    polls += 1;
    totalUpdated += updated;

    const keepGoing = stillLive || (await hasFixtureStartingSoon(supabase));
    if (!keepGoing) break;

    await sleep(POLL_INTERVAL_MS);
  }

  return { polls, totalUpdated };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncLiveScores()
    .then((result) => console.log('Live score sync complete:', result))
    .catch((err) => {
      console.error('Live score sync failed:', err);
      process.exitCode = 1;
    });
}
