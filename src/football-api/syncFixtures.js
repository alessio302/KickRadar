import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getMatches, sleep, STATUS_MAP } from './client.js';

const FIXTURE_WINDOW_DAYS = Number(process.env.FIXTURE_WINDOW_DAYS || 21);
// A matchday can span several days -- typically Fri-Mon, but confirmed
// live that a SEASON OPENER can span much wider: LaLiga's real 2026/27
// Jornada 1 runs 15-27 Aug (TV scheduling for the opening round is
// announced later than usual), 12 days, while Jornada 2 -- entirely
// within that same window (20-24 Aug) -- was fully synced. A 5-day past
// window meant Jornada 1's early games (15-19 Aug) were never fetched at
// all: only 4 of its 10 fixtures existed in the DB, all from its late
// end, which then sorted *after* the complete Jornada 2 by kickoff date.
// 15 days covers this with a little margin; still cheap; the frontend's
// own display-query window (useFixtures.js's PAST_WINDOW_DAYS) needs to
// stay at least this wide too, or a backfilled fixture would sync here
// but still not be queried back out for display.
//
// Widened well past that for the "Statistiken" tab's last-5-results form
// (useTeamForm.js): at ~1 match/week, 5 results span ~35 days, further
// once byes/international breaks are involved. This is still just ONE
// wider date-range query per league per sync (football-data.org's free
// tier caps requests/minute, not response size), so it costs nothing --
// unlike the frontend's own PAST_WINDOW_DAYS, which stays at 15 and is
// unrelated (that one bounds what shows in the Spiele tab's list, not
// what's available for a club-scoped stats query).
const FIXTURE_PAST_WINDOW_DAYS = Number(process.env.FIXTURE_PAST_WINDOW_DAYS || 60);

// Never let a fresh fetch move a fixture backwards through this ranking --
// see syncFixturesForLeague's own comment below on why a stale response can
// otherwise regress an already-live/finished fixture back to 'scheduled'.
const STATUS_RANK = { scheduled: 0, postponed: 0, cancelled: 0, live: 1, finished: 2 };

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

export async function syncFixturesForLeague(supabase, league) {
  const { data: dbLeague, error: leagueErr } = await supabase
    .from('leagues')
    .select('id')
    .eq('slug', league.slug)
    .single();
  if (leagueErr) throw leagueErr;

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, external_team_id')
    .eq('league_id', dbLeague.id);
  if (clubsErr) throw clubsErr;
  const clubIdByExternalId = new Map(clubs.map((c) => [c.external_team_id, c.id]));

  const from = toDateString(new Date(Date.now() - FIXTURE_PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const to = toDateString(new Date(Date.now() + FIXTURE_WINDOW_DAYS * 24 * 60 * 60 * 1000));

  const matches = await getMatches({ competitionId: league.externalCompetitionId, dateFrom: from, dateTo: to });
  const relevant = matches.filter((m) => clubIdByExternalId.has(m.homeTeam.id) && clubIdByExternalId.has(m.awayTeam.id));
  if (relevant.length === 0) return 0;

  // Confirmed live (Lille-PSG, 2026-08-28): this call's own date range spans
  // FIXTURE_PAST_WINDOW_DAYS+FIXTURE_WINDOW_DAYS (~80 days), and football-
  // data.org can serve a cached response for that broad query that lags
  // behind a match's real state -- a re-sync at 00:00 UTC overwrote a
  // fixture syncLiveScores.js had already correctly marked 'finished' (with
  // its final 2-2 score) hours earlier right back to 'scheduled' with a
  // null score, because this particular query was still serving a stale
  // snapshot from before kickoff. Fetching each match's current stored
  // status first and refusing to move it backwards through STATUS_RANK
  // means a stale response can no longer undo what syncLiveScores.js (or
  // syncLiveEvents.js) already established.
  const { data: existingRows, error: existingErr } = await supabase
    .from('fixtures')
    .select('external_fixture_id, status, home_score, away_score')
    .in('external_fixture_id', relevant.map((m) => m.id));
  if (existingErr) throw existingErr;
  const existingByExternalId = new Map(existingRows.map((r) => [r.external_fixture_id, r]));

  const rows = relevant.map((m) => {
    const existing = existingByExternalId.get(m.id);
    const fetchedStatus = STATUS_MAP[m.status] || 'scheduled';
    const regressing = existing && STATUS_RANK[existing.status] > STATUS_RANK[fetchedStatus];
    return {
      league_id: dbLeague.id,
      matchday: m.matchday,
      home_club_id: clubIdByExternalId.get(m.homeTeam.id),
      away_club_id: clubIdByExternalId.get(m.awayTeam.id),
      kickoff_at: m.utcDate,
      status: regressing ? existing.status : fetchedStatus,
      home_score: regressing ? existing.home_score : (m.score?.fullTime?.home ?? null),
      away_score: regressing ? existing.away_score : (m.score?.fullTime?.away ?? null),
      external_fixture_id: m.id,
      referee: m.referees?.find((r) => r.type === 'REFEREE')?.name ?? m.referees?.[0]?.name ?? null,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from('fixtures')
    .upsert(rows, { onConflict: 'external_fixture_id' });
  if (error) throw error;

  return rows.length;
}

export async function syncAllFixtures() {
  const supabase = getSupabaseClient();
  const results = {};
  for (const league of LEAGUES) {
    results[league.slug] = await syncFixturesForLeague(supabase, league);
    await sleep(1500); // stay well under the free tier's 10 req/min
  }
  return results;
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncAllFixtures()
    .then((results) => {
      console.log('Fixture sync complete:', results);
    })
    .catch((err) => {
      console.error('Fixture sync failed:', err);
      process.exitCode = 1;
    });
}
