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
const FIXTURE_PAST_WINDOW_DAYS = Number(process.env.FIXTURE_PAST_WINDOW_DAYS || 15);

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

  const rows = matches
    .filter((m) => clubIdByExternalId.has(m.homeTeam.id) && clubIdByExternalId.has(m.awayTeam.id))
    .map((m) => ({
      league_id: dbLeague.id,
      matchday: m.matchday,
      home_club_id: clubIdByExternalId.get(m.homeTeam.id),
      away_club_id: clubIdByExternalId.get(m.awayTeam.id),
      kickoff_at: m.utcDate,
      status: STATUS_MAP[m.status] || 'scheduled',
      home_score: m.score?.fullTime?.home ?? null,
      away_score: m.score?.fullTime?.away ?? null,
      external_fixture_id: m.id,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return 0;

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
