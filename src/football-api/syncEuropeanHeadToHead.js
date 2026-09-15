import { getSupabaseClient } from '../db/supabaseClient.js';
import { getLeagueTeams, getHeadToHeadDirect } from '../lineups/goalApiClient.js';
import { resolveClub } from '../news/clubMatch.js';
import { UEFA_COMPETITIONS } from '../config/leagues.js';

// Name-keyed counterpart to syncHeadToHead.js -- see sql/058's own comment
// for why. Candidate selection (needsFetch, pacing, prioritizing the
// nearest-kickoff pairing first) deliberately mirrors syncHeadToHead.js
// exactly; only the identity key (team names, not club_id) and the GOAL
// API lookup differ.
const MAX_FETCHES_PER_RUN = Number(process.env.EUROPEAN_HEAD_TO_HEAD_MAX_FETCHES || 20);
const MATCHES_TO_KEEP = 5;

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// GOAL API's own team objects only ever carry { id, name, ... } -- no
// short_name/aliases the way our curated clubs table does -- so
// resolveClub() (built for that richer shape) still works here, just fed a
// plainer candidate list. Deliberately reused rather than reimplemented:
// same conservative exact-or-substring matching, same "no match beats a
// wrong match" philosophy that a free-text team name needs here too.
function resolveGoalApiTeam(teamName, goalApiTeams) {
  return resolveClub(teamName, goalApiTeams);
}

export async function syncEuropeanHeadToHead() {
  const supabase = getSupabaseClient();

  const { data: dbLeagues, error: leaguesErr } = await supabase
    .from('leagues')
    .select('id, slug')
    .in('slug', UEFA_COMPETITIONS.map((c) => c.slug));
  if (leaguesErr) throw leaguesErr;
  const compByLeagueId = new Map(dbLeagues.map((l) => [l.id, UEFA_COMPETITIONS.find((c) => c.slug === l.slug)]));

  const { data: fixtures, error: fixturesErr } = await supabase
    .from('fixtures')
    .select('league_id, home_team_name, away_team_name, status, kickoff_at')
    .in('league_id', [...compByLeagueId.keys()])
    .in('status', ['scheduled', 'live', 'finished']);
  if (fixturesErr) throw fixturesErr;

  const { data: existingRows, error: existingErr } = await supabase
    .from('european_head_to_head')
    .select('team_name_a, team_name_b, updated_at');
  if (existingErr) throw existingErr;
  const existingByPair = new Map(existingRows.map((r) => [pairKey(r.team_name_a, r.team_name_b), r]));

  const now = Date.now();
  const seenKeys = new Set();
  const candidates = fixtures
    .filter((f) => f.home_team_name && f.away_team_name && f.home_team_name !== f.away_team_name)
    .map((f) => {
      const key = pairKey(f.home_team_name, f.away_team_name);
      const existing = existingByPair.get(key);
      // Same re-fetch rule as syncHeadToHead.js: only when a fixture in
      // this pairing finished more recently than our last snapshot, or
      // we've genuinely never seen the pairing -- past results don't change.
      const needsFetch = !existing || (f.status === 'finished' && new Date(f.kickoff_at).getTime() > new Date(existing.updated_at).getTime());
      return needsFetch ? { fixture: f, key } : null;
    })
    .filter(Boolean)
    .filter((c) => (seenKeys.has(c.key) ? false : (seenKeys.add(c.key), true)))
    .sort((a, b) => Math.abs(new Date(a.fixture.kickoff_at) - now) - Math.abs(new Date(b.fixture.kickoff_at) - now))
    .slice(0, MAX_FETCHES_PER_RUN);

  // One /leagues/:id/teams call per distinct competition in this run, not
  // per candidate -- every candidate in the same league shares the same
  // team list to resolve against.
  const teamsByLeagueId = new Map();
  async function teamsForLeague(leagueId) {
    if (!teamsByLeagueId.has(leagueId)) {
      const comp = compByLeagueId.get(leagueId);
      const teams = comp ? await getLeagueTeams(comp.goalApiLeagueId) : [];
      teamsByLeagueId.set(leagueId, teams);
    }
    return teamsByLeagueId.get(leagueId);
  }

  let synced = 0;
  let unresolved = 0;
  for (const { fixture, key } of candidates) {
    const [nameA, nameB] = key.split('|');
    const teams = await teamsForLeague(fixture.league_id);
    const teamA = resolveGoalApiTeam(nameA, teams);
    const teamB = resolveGoalApiTeam(nameB, teams);
    if (!teamA || !teamB || teamA.id === teamB.id) {
      unresolved += 1;
      console.warn(`Could not resolve both GOAL API team ids for "${nameA}" vs "${nameB}"`);
      continue;
    }

    const rawMatches = await getHeadToHeadDirect(teamA.id, teamB.id);
    const matches = rawMatches
      .map((m) => ({
        id: m.match_id,
        date: m.match_date,
        home_team_name: m.match_hometeam_name,
        away_team_name: m.match_awayteam_name,
        home_score: Number.parseInt(m.match_hometeam_score, 10),
        away_score: Number.parseInt(m.match_awayteam_score, 10),
      }))
      .filter((m) => Number.isFinite(m.home_score) && Number.isFinite(m.away_score))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, MATCHES_TO_KEEP);

    const { error } = await supabase
      .from('european_head_to_head')
      .upsert({ team_name_a: nameA, team_name_b: nameB, matches, updated_at: new Date().toISOString() }, { onConflict: 'team_name_a,team_name_b' });
    if (error) throw error;

    synced += 1;
  }

  return { candidates: candidates.length, synced, unresolved };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncEuropeanHeadToHead()
    .then((result) => {
      console.log('European head-to-head sync complete:', result);
    })
    .catch((err) => {
      console.error('European head-to-head sync failed:', err);
      process.exitCode = 1;
    });
}
