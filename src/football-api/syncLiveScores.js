import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getMatches, sleep, STATUS_MAP } from './client.js';
import { sendPushToFixtureFavoriters } from '../push/sendPush.js';
import { buildFixtureStatusPayloads } from '../push/fixtureNotifier.js';
import { syncStandingsForLeague } from './syncStandings.js';

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
// Backstop, not primary, since 2026-09-08: the goal-api-webhook Edge
// Function already flips fixtures.status scheduled->live->finished and
// writes home_score/away_score the moment GOAL API pushes match.started/
// goal.scored/score.changed/match.finished -- confirmed live via 409 real
// webhook deliveries sitting unused in webhook_debug_log before that
// handler existed. This loop still exists for whatever the webhook misses
// (a dropped delivery, GOAL API's own outage) and for referee (still only
// available from football-data.org, piggybacked below), so 2 minutes
// between polls is plenty to self-heal without the webhook's help, at a
// quarter of the previous request volume during a live window.
//
// Free tier: 10 req/min, shared across every football-data.org caller in
// the repo -- head-to-head-sync.js in particular already runs itself at
// ~9.2 req/min whenever it's active (4x/day, short windows), so an overlap
// with that job can still push the shared account-wide total over the cap
// even with this file's own rate kept modest. pollOnce() below is
// resilient to a single league's request failing (a 429 from exactly that
// kind of overlap, or any transient error) so a rate-limit hit skips just
// that league for one cycle instead of aborting the whole 13-minute loop.
const POLL_INTERVAL_MS = 120_000;

// Same anti-regression guard syncLiveEvents.js's own STATUS_RANK already
// applies to its European live-score writes -- confirmed live this file
// needed the exact same protection (2026-09-11, Stade Rennais vs
// Marseille): the goal-api-webhook can legitimately finish a match before
// football-data.org's own feed catches up, and this poll's status write
// used to be unconditional, overwriting that correct 'finished' back to
// 'live' on the very next tick and repeating every 120s until football-
// data.org's own feed agreed (confirmed live: still wrong 8+ minutes and
// several poll ticks after the webhook's match.finished had landed).
const STATUS_RANK = { scheduled: 0, postponed: 0, cancelled: 0, live: 1, finished: 2 };

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

// Kickoff/full-time push for whoever favorited this fixture -- piggybacked
// on this loop's own status write rather than a separate poller, since this
// is exactly the place that already knows the moment football-data.org
// reports the transition. Only two milestones map here; the 30/15-minute
// pre-kickoff reminders are a separate, always-on poller (see
// sendFixtureReminders.js) since they need to fire well before this loop
// even wakes up (see UPCOMING_WINDOW_MS above -- this only starts polling
// within 10 minutes of kickoff, too late for a 30-minute reminder).
//
// fixture_reminders_sent's primary key (fixture_id, milestone) is the only
// thing preventing a duplicate push here, not the newStatus check --
// 'live' stays true on every single poll tick for a match's whole duration
// (~45+ ticks at 2min/poll), so the insert-as-claim below is what makes
// only the first tick actually send anything, same pattern as
// matchEventNotifier.js's notified_match_events.
const MILESTONE_BY_STATUS = { live: 'kickoff', finished: 'finished' };

async function notifyFixtureStatusChange(supabase, clubById, fixtureRow, leagueSlug, newStatus, homeScore, awayScore) {
  const milestone = MILESTONE_BY_STATUS[newStatus];
  if (!milestone) return;

  const { count, error: favErr } = await supabase
    .from('favorite_fixtures')
    .select('id', { count: 'exact', head: true })
    .eq('fixture_id', fixtureRow.id);
  if (favErr) {
    console.error(`Failed to check favorites for fixture ${fixtureRow.id}:`, favErr.message);
    return;
  }
  if (!count) return; // no work at all for a fixture nobody favorited

  const { error: claimErr } = await supabase.from('fixture_reminders_sent').insert({ fixture_id: fixtureRow.id, milestone });
  if (claimErr) {
    if (claimErr.code !== '23505') console.error(`Failed to claim ${milestone} for fixture ${fixtureRow.id}:`, claimErr.message);
    return;
  }

  const homeClub = clubById.get(fixtureRow.home_club_id);
  const awayClub = clubById.get(fixtureRow.away_club_id);
  if (!homeClub || !awayClub || !leagueSlug) return;

  const payloads = buildFixtureStatusPayloads({
    milestone,
    homeClub,
    awayClub,
    leagueSlug,
    fixtureId: fixtureRow.id,
    homeScore,
    awayScore,
  });
  try {
    await sendPushToFixtureFavoriters(fixtureRow.id, payloads);
  } catch (err) {
    console.error(`Failed to push ${milestone} for fixture ${fixtureRow.id}:`, err.message);
  }
}

// Deliberately not scoped to status=LIVE -- a match that just finished
// would silently drop out of that filter on the very next poll, leaving
// its final score/status un-written until the next 4x-daily fixtures-sync
// run (hours later) instead of within this same ~75s cycle. Fetching each
// league's full match list once and updating every live-or-finished row in
// it catches that transition for free, no cross-poll state needed.
async function pollOnce(supabase, clubById) {
  const date = toDateString(new Date());
  const matches = [];
  for (const league of LEAGUES) {
    try {
      const leagueMatches = await getMatches({ competitionId: league.externalCompetitionId, dateFrom: date, dateTo: date });
      // Tagged with this league's own slug now, before the per-league
      // arrays get flattened into one below -- notifyFixtureStatusChange()
      // needs it for the push payload's deep-link URL, and there's no other
      // way to recover which league a given match came from afterwards.
      matches.push(...leagueMatches.map((m) => ({ ...m, _leagueSlug: league.slug })));
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
  // Slugs of leagues that had a fixture actually reach 'finished' in this
  // tick -- standings.js's own syncStandingsForLeague() gets called for
  // exactly these right after the poll loop below, instead of waiting for
  // standings-sync.yml's own separate once-a-day safety-net cron. Simplest
  // possible trigger: it doesn't matter whether the webhook or this same
  // poll is what actually flipped the status to 'finished' (both funnel
  // through the same `.update()` a few lines down), so this catches either
  // source within this job's own ~2min poll cadence.
  const finishedLeagueSlugs = new Set();

  for (const m of matches) {
    if (m.status === 'IN_PLAY' || m.status === 'PAUSED') stillLive = true;

    // Piggybacks referee onto this same already-fetched response instead of
    // a separate call anywhere else -- confirmed live (2026-09-06) this app
    // had grown a dedicated referee fetch in syncLineups.js's own 15-min
    // loop, calling this exact same per-competition endpoint a second time
    // for data this poll already has for free. This function already
    // fetches every one of today's matches (any status) for every league
    // at least once per invocation regardless of whether anything's live,
    // so a scheduled fixture's referee lands here the moment football-
    // data.org assigns it, at zero extra request cost. .is('referee', null)
    // skips the write once it's already set, rather than re-writing the
    // same value on every poll.
    const referee = m.referees?.find((r) => r.type === 'REFEREE')?.name ?? m.referees?.[0]?.name ?? null;
    if (referee) {
      const { error: refereeErr } = await supabase.from('fixtures').update({ referee }).eq('external_fixture_id', m.id).is('referee', null);
      if (refereeErr) console.error(`Failed to update referee for match ${m.id}:`, refereeErr.message);
    }

    if (m.status !== 'IN_PLAY' && m.status !== 'PAUSED' && m.status !== 'FINISHED') continue;

    const newStatus = STATUS_MAP[m.status] || 'live';
    const homeScore = m.score?.fullTime?.home ?? null;
    const awayScore = m.score?.fullTime?.away ?? null;

    const { data: current, error: currentErr } = await supabase
      .from('fixtures')
      .select('status')
      .eq('external_fixture_id', m.id)
      .maybeSingle();
    if (currentErr) {
      console.error(`Failed to read current status for match ${m.id}:`, currentErr.message);
    } else if (current && STATUS_RANK[newStatus] < STATUS_RANK[current.status]) {
      continue; // already further along by a faster source (the webhook) -- never walk it backwards
    }

    const { data: updatedRows, error } = await supabase
      .from('fixtures')
      .update({
        status: newStatus,
        home_score: homeScore,
        away_score: awayScore,
        updated_at: new Date().toISOString(),
      })
      .eq('external_fixture_id', m.id)
      .select('id, home_club_id, away_club_id');
    if (error) {
      console.error(`Failed to update live score for match ${m.id}:`, error.message);
      continue;
    }
    updated += 1;
    if (newStatus === 'finished') finishedLeagueSlugs.add(m._leagueSlug);

    const fixtureRow = updatedRows?.[0];
    if (fixtureRow) {
      await notifyFixtureStatusChange(supabase, clubById, fixtureRow, m._leagueSlug, newStatus, homeScore, awayScore);
    }

    // Not cleared here on newStatus === 'finished' -- confirmed live this
    // was tried and immediately conflicted with the highlight-video push
    // feature (src/lineups/syncHighlights.js): a highlight clip typically
    // isn't posted until minutes-to-hours after full time, so deleting the
    // favorite the instant the match ends means nobody's left to notify by
    // the time one shows up. syncHighlights.js clears a fixture's
    // favorites itself right after successfully pushing its highlight;
    // the pg_cron job favorite_fixtures_finished_cleanup (034 migration)
    // is the 24h backstop for a match that never gets a highlight at all.
  }

  return { updated, stillLive, finishedLeagueSlugs };
}

// syncStandingsForLeague() already no-ops (no football-data.org call at
// all) once a league's standings_finished_count already matches, so
// calling it here is never redundant work on top of what standings-sync.yml
// would have done anyway -- it just does that same check right after a
// finish instead of waiting for the next scheduled window. Isolated
// per-league (one failure shouldn't cost the others, or this whole poll
// tick) and rate-limited the same way every other multi-league loop in
// this file already is.
async function refreshStandingsFor(supabase, leagueSlugs) {
  for (const slug of leagueSlugs) {
    const league = LEAGUES.find((l) => l.slug === slug);
    if (!league) continue;
    try {
      await syncStandingsForLeague(supabase, league);
    } catch (err) {
      console.error(`Failed to refresh standings for ${slug}:`, err.message);
    }
    await sleep(1500); // stay well under the free tier's 10 req/min
  }
}

export async function syncLiveScores() {
  const supabase = getSupabaseClient();

  // Loaded once per invocation, not per poll tick -- club identity/crest
  // don't change mid-run, and this loop can tick dozens of times across a
  // long live window.
  const { data: clubs, error: clubsErr } = await supabase.from('clubs').select('id, name, crest_url');
  if (clubsErr) throw clubsErr;
  const clubById = new Map(clubs.map((c) => [c.id, c]));

  const deadline = Date.now() + JOB_BUDGET_MS;
  let polls = 0;
  let totalUpdated = 0;

  while (Date.now() < deadline) {
    const { updated, stillLive, finishedLeagueSlugs } = await pollOnce(supabase, clubById);
    polls += 1;
    totalUpdated += updated;

    if (finishedLeagueSlugs.size > 0) await refreshStandingsFor(supabase, finishedLeagueSlugs);

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
