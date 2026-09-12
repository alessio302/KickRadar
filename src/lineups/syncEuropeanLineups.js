// Lineups for UCL/UEL/UECL. Same GOAL API endpoints and near-kickoff /
// finished-recent windowing as syncLineups.js (see that file's own
// comments for LOOKAHEAD_MIN/LOOKBACK_MIN/LINEUP_GIVE_UP_MIN rationale),
// kept as a separate job rather than folded into syncLineups.js because
// the matching key is different throughout: these fixtures have no
// clubs table row (home_club_id/away_club_id are always null -- see
// syncEuropeanFixtures.js's own comment), so lineups (and, as of
// 2026-09-12, match_events too) are stored and read back keyed by
// team_name (sql/051_lineups_team_name.sql, sql/054_match_events_team_name.sql)
// instead of club_id.
//
// Match-events sync mirrors syncLineups.js's own exactly -- see that
// file's own comment on why a still-'live' fixture gets refreshed on
// every run now, not just once after it finishes, and
// matchEventsReconciler.js's own comment on how that coexists with
// syncLiveEvents.js's own WebSocket connection (still this app's fast
// path for every league, domestic and European alike) without either
// duplicating the other. Originally out of scope for this file's own
// first cut (a plain "no match-events sync here yet") -- brought in line
// with the domestic side rather than left as a permanent asymmetry once
// that side got its own REST backstop.
//
// EL/UECL fixtures already carry goal_api_id directly from
// syncEuropeanFixtures.js (GOAL API is their fixture source). UCL comes
// from football-data.org instead, so its fixtures only have
// external_fixture_id -- goal_api_id is resolved here the same way
// syncLineups.js resolves it for the 5 domestic leagues (one
// getLeagueFixtures() call per pending date, matched and cached), just by
// team name instead of resolveClub() against a clubs table row, since UCL
// clubs like Real Madrid aren't in that table either.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { UEFA_COMPETITIONS } from '../config/leagues.js';
import { getLeagueFixtures, getFixtureLineups, getFixtureEvents, getFixtureCards, getFixtureSubstitutions } from './goalApiClient.js';
import { teamIsPopulated, buildLineupTeam } from './lineupShape.js';
import { normalize } from '../util/normalize.js';
import { buildEventRowsFromRest } from './eventRows.js';
import { reconcileMatchEvents } from './matchEventsReconciler.js';

const LOOKAHEAD_MIN = 45;
const LOOKBACK_MIN = 90;
const LINEUP_GIVE_UP_MIN = 360;
const PAST_WINDOW_DAYS = 15;

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function confirmedKey(fixtureId, teamName) {
  return `${fixtureId}:${teamName}`;
}

// Loose name matching between football-data.org's UCL fixture (already in
// our fixtures table as home_team_name/away_team_name) and GOAL API's own
// UCL fixture list -- there's no shared id between the two providers for
// UCL the way there is for EL/UECL (GOAL API is their direct source).
// Strips common club-suffix words rather than requiring an exact string
// match: confirmed live the two providers don't always agree on the
// suffix ("Real Madrid CF" vs "Real Madrid"). Only a handful of UCL
// fixtures share a single date, so the includes() fallback's collision
// risk is low -- two different clubs' normalized names containing one
// another would need one to literally be a substring of the other.
function normalizeTeamName(name) {
  return normalize(name || '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(fc|cf|afc|ac|sc|cd|ud|ssc|ssd|calcio|club)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function namesLooselyMatch(a, b) {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export async function syncEuropeanLineups() {
  const supabase = getSupabaseClient();
  const now = new Date();
  const windowStart = new Date(now.getTime() - LOOKBACK_MIN * 60000).toISOString();
  const windowEnd = new Date(now.getTime() + LOOKAHEAD_MIN * 60000).toISOString();
  const pastCutoff = new Date(now.getTime() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: dbLeagues, error: leaguesErr } = await supabase
    .from('leagues')
    .select('id, slug')
    .in('slug', UEFA_COMPETITIONS.map((c) => c.slug));
  if (leaguesErr) throw leaguesErr;
  if (dbLeagues.length === 0) return { checked: 0, confirmed: 0, eventsFetched: 0 };

  const compBySlug = new Map(UEFA_COMPETITIONS.map((c) => [c.slug, c]));
  const compByLeagueId = new Map(dbLeagues.map((l) => [l.id, compBySlug.get(l.slug)]));
  const leagueIds = dbLeagues.map((l) => l.id);

  const selectCols = 'id, league_id, home_team_name, away_team_name, kickoff_at, status, events_synced_at, goal_api_id';
  const { data: nearKickoff, error: nkErr } = await supabase
    .from('fixtures')
    .select(selectCols)
    .in('league_id', leagueIds)
    .gte('kickoff_at', windowStart)
    .lte('kickoff_at', windowEnd);
  if (nkErr) throw nkErr;

  const { data: finishedRecent, error: frErr } = await supabase
    .from('fixtures')
    .select(selectCols)
    .in('league_id', leagueIds)
    .eq('status', 'finished')
    .gte('kickoff_at', pastCutoff);
  if (frErr) throw frErr;

  // Separate from nearKickoff above, same rationale as syncLineups.js's own
  // identical addition: that window is sized for lineup confirmation, not
  // for covering a whole match, so a fixture deep into extra time or one
  // this job hasn't run for in a while could already have drifted outside
  // it while still genuinely 'live'.
  const { data: currentlyLive, error: liveErr } = await supabase
    .from('fixtures')
    .select(selectCols)
    .in('league_id', leagueIds)
    .eq('status', 'live');
  if (liveErr) throw liveErr;

  const fixturesById = new Map();
  for (const f of [...nearKickoff, ...finishedRecent, ...currentlyLive]) fixturesById.set(f.id, f);
  const candidates = [...fixturesById.values()];
  if (candidates.length === 0) return { checked: 0, confirmed: 0, eventsFetched: 0 };

  const { data: existingLineups, error: existingErr } = await supabase
    .from('lineups')
    .select('fixture_id, team_name, confirmed')
    .in('fixture_id', candidates.map((f) => f.id));
  if (existingErr) throw existingErr;
  const alreadyConfirmed = new Set(
    existingLineups.filter((r) => r.confirmed).map((r) => confirmedKey(r.fixture_id, r.team_name))
  );

  const lineupNeeded = (f) => {
    if (!f.home_team_name || !f.away_team_name) return false;
    const bothConfirmed =
      alreadyConfirmed.has(confirmedKey(f.id, f.home_team_name)) && alreadyConfirmed.has(confirmedKey(f.id, f.away_team_name));
    if (bothConfirmed) return false;
    const minutesSinceKickoff = (now.getTime() - new Date(f.kickoff_at).getTime()) / 60000;
    return minutesSinceKickoff <= LINEUP_GIVE_UP_MIN;
  };
  // Same shape as syncLineups.js's own eventsNeeded() -- see that file's
  // comment for the full rationale (a 'live' fixture refreshed every run,
  // unconditionally, since there's no cheap signal to know in advance
  // whether anything changed for a match still being played).
  const eventsNeeded = (f) => f.status === 'live' || (f.status === 'finished' && !f.events_synced_at);

  const pending = candidates.filter((f) => lineupNeeded(f) || eventsNeeded(f));
  // checked: 0, not candidates.length -- see syncLineups.js's own comment
  // on the identical line: candidates is the raw DB query result before
  // the lineupNeeded filter, none of which costs a GOAL API call by
  // itself. Confirmed live (2026-09-09): a run with zero live/near-kickoff
  // European fixtures logged "checked: 42" while making zero GOAL API
  // calls, which looked like real request volume during a diagnosis of
  // this account's daily usage and cost real investigation time to rule
  // out.
  if (pending.length === 0) return { checked: 0, confirmed: 0, eventsFetched: 0 };

  // Group by (competition, date) -- one getLeagueFixtures() call covers
  // every pending fixture for that competition on that date, same
  // grouping rationale as syncLineups.js.
  const groups = new Map();
  for (const f of pending) {
    const comp = compByLeagueId.get(f.league_id);
    if (!comp) continue;
    const dateStr = toDateString(new Date(f.kickoff_at));
    const key = `${comp.slug}|${dateStr}`;
    if (!groups.has(key)) groups.set(key, { comp, dateStr, fixtures: [] });
    groups.get(key).fixtures.push(f);
  }

  let checked = 0;
  let confirmedCount = 0;
  let eventsFetched = 0;

  for (const { comp, dateStr, fixtures: groupFixtures } of groups.values()) {
    const needsResolution = groupFixtures.some((f) => !f.goal_api_id);
    let apiFixtures = null;
    if (needsResolution) {
      try {
        apiFixtures = await getLeagueFixtures(comp.goalApiLeagueId, dateStr);
      } catch (err) {
        console.error(`GOAL API fixtures failed for ${comp.slug} ${dateStr}:`, err.message);
      }
    }

    for (const f of groupFixtures) {
      let goalApiId = f.goal_api_id;
      if (!goalApiId) {
        if (!apiFixtures) continue; // resolution needed but failed (or wasn't attempted) this run
        const match = apiFixtures.find(
          (m) => namesLooselyMatch(m.homeTeam?.name, f.home_team_name) && namesLooselyMatch(m.awayTeam?.name, f.away_team_name)
        );
        if (!match) continue;
        goalApiId = String(match.id);
        // Best-effort: a failed write here only costs re-resolving this
        // one fixture again next run, never lost lineup coverage for it.
        const { error: cacheErr } = await supabase.from('fixtures').update({ goal_api_id: goalApiId }).eq('id', f.id);
        if (cacheErr) console.error(`Failed to cache goal_api_id for fixture ${f.id}:`, cacheErr.message);
      }

      checked += 1;

      if (lineupNeeded(f)) {
        let lineups;
        try {
          lineups = await getFixtureLineups(goalApiId);
        } catch (err) {
          console.error(`GOAL API lineups failed for match ${goalApiId}:`, err.message);
          lineups = null;
        }

        if (lineups?.hasLineups) {
          const homeTeam = buildLineupTeam(lineups.home, lineups.homeFormation);
          const awayTeam = buildLineupTeam(lineups.away, lineups.awayFormation);
          if (homeTeam) homeTeam.formation = lineups.homeFormation || null;
          if (awayTeam) awayTeam.formation = lineups.awayFormation || null;

          for (const { teamName, team } of [
            { teamName: f.home_team_name, team: homeTeam },
            { teamName: f.away_team_name, team: awayTeam },
          ]) {
            if (!teamIsPopulated(team)) continue;
            const { error: upsertErr } = await supabase.from('lineups').upsert(
              {
                fixture_id: f.id,
                team_name: teamName,
                confirmed: true,
                formation: team.formation,
                players: { initialLineup: team.initialLineup, substitutes: team.substitutes, coach: team.coach },
                published_at: new Date().toISOString(),
              },
              { onConflict: 'fixture_id,team_name' }
            );
            if (upsertErr) {
              console.error(`Failed to store lineup for fixture ${f.id} team ${teamName}:`, upsertErr.message);
              continue;
            }
            confirmedCount += 1;
          }
        }
      }

      // Same shape as syncLineups.js's own events block -- see that file's
      // comment for the full rationale (reconcileMatchEvents() instead of a
      // blind delete+insert, so this coexists safely with syncLiveEvents.js's
      // own WebSocket connection, still this app's fast path for these
      // fixtures too).
      if (eventsNeeded(f)) {
        let goals, cards, substitutions;
        try {
          [goals, cards, substitutions] = await Promise.all([
            getFixtureEvents(goalApiId),
            getFixtureCards(goalApiId),
            getFixtureSubstitutions(goalApiId),
          ]);
        } catch (err) {
          console.error(`GOAL API events/cards/substitutions failed for match ${goalApiId}:`, err.message);
          goals = null;
        }

        if (goals) {
          const sideRef = (isHomeField) => ({ team_name: isHomeField ? f.home_team_name : f.away_team_name });
          const rows = buildEventRowsFromRest(f.id, sideRef, { goals, cards, substitutions });
          await reconcileMatchEvents(supabase, f.id, comp.slug, rows);

          // events_synced_at is a permanent "fully done" flag -- see
          // syncLineups.js's own identical comment on why this only ever
          // gets set once the fixture has actually finished.
          if (f.status === 'finished') {
            const { error: markErr } = await supabase
              .from('fixtures')
              .update({ events_synced_at: new Date().toISOString() })
              .eq('id', f.id);
            if (markErr) console.error(`Failed to mark events_synced_at for fixture ${f.id}:`, markErr.message);
            else eventsFetched += 1;
          } else {
            eventsFetched += 1;
          }
        }
      }
    }
  }

  return { checked, confirmed: confirmedCount, eventsFetched };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncEuropeanLineups()
    .then((result) => console.log('European lineup sync complete:', result))
    .catch((err) => {
      console.error('European lineup sync failed:', err);
      process.exitCode = 1;
    });
}
