import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getMatchesForDate, sleep, STATUS_MAP } from './client.js';

const COMPETITION_IDS = LEAGUES.map((l) => l.externalCompetitionId);

// Free tier: 10 req/min. One poll = one request (see getMatchesForDate),
// so 75s between polls is nowhere near the ceiling even run back-to-back;
// the real reason it isn't faster is that live-score providers generally
// don't refresh more often than this anyway, paid or not.
const POLL_INTERVAL_MS = 75_000;

// Bounded below the workflow's own 15-min job timeout so the process exits
// cleanly on its own before GitHub Actions would kill it mid-request, and
// below the outer schedule's 15-min cadence so consecutive runs don't
// overlap.
const JOB_BUDGET_MS = 13 * 60 * 1000;

// How long before kickoff to start polling -- a scheduled fixture flips to
// IN_PLAY sometime around its kickoff_at, not exactly on it (added time,
// late starts), so this needs some slack either side.
const UPCOMING_WINDOW_MS = 10 * 60 * 1000;

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
  const soon = new Date(now.getTime() + UPCOMING_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from('fixtures')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'scheduled')
    .gte('kickoff_at', now.toISOString())
    .lte('kickoff_at', soon);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// Deliberately not scoped to status=LIVE -- a match that just finished
// would silently drop out of that filter on the very next poll, leaving
// its final score/status un-written until the next 4x-daily fixtures-sync
// run (hours later) instead of within this same ~75s cycle. Fetching
// today's full match list once and updating every live-or-finished row in
// it catches that transition for free, no extra request or cross-poll
// state needed.
async function pollOnce(supabase) {
  const matches = await getMatchesForDate({ competitionIds: COMPETITION_IDS, date: toDateString(new Date()) });
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
