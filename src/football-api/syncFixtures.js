import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getFixtures, getCurrentSeason } from './client.js';

const FIXTURE_WINDOW_DAYS = Number(process.env.FIXTURE_WINDOW_DAYS || 21);

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

// API-Football rounds look like "Regular Season - 5"; we only need the number.
function parseMatchday(round) {
  const match = /(\d+)\s*$/.exec(round || '');
  return match ? Number(match[1]) : null;
}

const STATUS_MAP = {
  NS: 'scheduled',
  TBD: 'scheduled',
  '1H': 'live',
  HT: 'live',
  '2H': 'live',
  ET: 'live',
  P: 'live',
  LIVE: 'live',
  FT: 'finished',
  AET: 'finished',
  PEN: 'finished',
  PST: 'postponed',
  CANC: 'cancelled',
  ABD: 'cancelled',
  AWD: 'finished',
  WO: 'finished',
};

export async function syncFixturesForLeague(supabase, league, season) {
  const { data: dbLeague, error: leagueErr } = await supabase
    .from('leagues')
    .select('id')
    .eq('slug', league.slug)
    .single();
  if (leagueErr) throw leagueErr;

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, api_football_id')
    .eq('league_id', dbLeague.id);
  if (clubsErr) throw clubsErr;
  const clubIdByApiId = new Map(clubs.map((c) => [c.api_football_id, c.id]));

  const from = toDateString(new Date());
  const to = toDateString(new Date(Date.now() + FIXTURE_WINDOW_DAYS * 24 * 60 * 60 * 1000));

  const fixtures = await getFixtures({ leagueId: league.apiFootballId, season, from, to });

  const rows = fixtures
    .filter((f) => clubIdByApiId.has(f.teams.home.id) && clubIdByApiId.has(f.teams.away.id))
    .map((f) => ({
      league_id: dbLeague.id,
      matchday: parseMatchday(f.league.round),
      home_club_id: clubIdByApiId.get(f.teams.home.id),
      away_club_id: clubIdByApiId.get(f.teams.away.id),
      kickoff_at: f.fixture.date,
      status: STATUS_MAP[f.fixture.status.short] || 'scheduled',
      home_score: f.goals.home,
      away_score: f.goals.away,
      api_football_fixture_id: f.fixture.id,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from('fixtures')
    .upsert(rows, { onConflict: 'api_football_fixture_id' });
  if (error) throw error;

  return rows.length;
}

export async function syncAllFixtures() {
  const supabase = getSupabaseClient();
  const season = getCurrentSeason();
  const results = {};
  for (const league of LEAGUES) {
    results[league.slug] = await syncFixturesForLeague(supabase, league, season);
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
