import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getMatches, sleep, STATUS_MAP } from './client.js';

const FIXTURE_WINDOW_DAYS = Number(process.env.FIXTURE_WINDOW_DAYS || 21);
// A matchday can span several days (typically Fri-Mon); syncing strictly
// from "today" forward means a game that already happened earlier in the
// current matchday is never fetched at all -- confirmed live (Inter-Monza
// missing from Serie A's "current matchday" view even though the rest of
// that same round was there). Reaching a few days back covers that.
const FIXTURE_PAST_WINDOW_DAYS = Number(process.env.FIXTURE_PAST_WINDOW_DAYS || 5);

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
