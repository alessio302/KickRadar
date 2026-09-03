import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getMatches, sleep, STATUS_MAP } from './client.js';

// Confirmed live (dumpSeasonMatches.js, since removed): football-data.org's
// /competitions/:id/matches endpoint returns the WHOLE current season --
// all 380 matches, matchdays 1-38, Aug through May -- when dateFrom/dateTo
// are simply omitted, in one call, same request cost as the old ~81-day
// window query (its own comment already established the free tier caps
// requests/minute, not response size). Used to fetch only a rolling
// ~81-day window (60 days back, 21 ahead) -- correctness-wise that was
// arguably wider than it needed to be for a typical round, and existed
// mainly to keep the response small, an assumption disproven above.
// Fetching the whole season outright means the "nur aktueller Spieltag"
// toggle (FixturesTab.jsx) can actually show every matchday when
// unchecked, not just whichever ~3 rounds happened to fall inside that
// window -- confirmed live via a user report that most of the season was
// simply missing with the toggle off, because sync had never fetched it
// in the first place, not a frontend filtering bug.
//
// Never let a fresh fetch move a fixture backwards through this ranking --
// see syncFixturesForLeague's own comment below on why a stale response can
// otherwise regress an already-live/finished fixture back to 'scheduled'.
const STATUS_RANK = { scheduled: 0, postponed: 0, cancelled: 0, live: 1, finished: 2 };

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

  const matches = await getMatches({ competitionId: league.externalCompetitionId });
  const relevant = matches.filter((m) => clubIdByExternalId.has(m.homeTeam.id) && clubIdByExternalId.has(m.awayTeam.id));
  if (relevant.length === 0) return 0;

  // Confirmed live (Lille-PSG, 2026-08-28, back when this call still passed
  // an explicit ~80-day dateFrom/dateTo range): football-data.org can serve
  // a cached response for a broad matches query that lags behind a match's
  // real state -- a re-sync at 00:00 UTC overwrote a fixture
  // syncLiveScores.js had already correctly marked 'finished' (with its
  // final 2-2 score) hours earlier right back to 'scheduled' with a null
  // score, because that query was still serving a stale snapshot from
  // before kickoff. Nothing about fetching the whole season instead (no
  // date range at all) makes this safer or worse -- still the same
  // provider-side caching risk on a request this broad -- so the guard
  // stays: fetching each match's current stored status first and refusing
  // to move it backwards through STATUS_RANK means a stale response can no
  // longer undo what syncLiveScores.js (or syncLiveEvents.js) already
  // established.
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
      // Confirmed live: SCHEDULED means the date is fixed but football-
      // data.org hasn't got a real kickoff time yet -- utcDate is a bare
      // 00:00:00 UTC placeholder in that case, not an actual local
      // midnight kickoff. Every other status (TIMED, IN_PLAY, FINISHED,
      // ...) carries a real utcDate. See sql/042 for why this doesn't
      // affect STATUS_MAP's own 'scheduled' bucket, which both SCHEDULED
      // and TIMED still map into.
      kickoff_confirmed: m.status !== 'SCHEDULED',
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
