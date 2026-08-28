import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useLeagueId } from './useLeagueId.js';

// How far back to include already-played fixtures. Kept in sync with
// syncFixturesForLeague's own FIXTURE_PAST_WINDOW_DAYS (src/football-api/
// syncFixtures.js) -- a fixture that sync now backfills but this query
// still excludes would sync successfully and still never appear. See that
// file's comment: a season opener can span much wider than a typical
// Fri-Mon round (confirmed live: LaLiga's 2026/27 Jornada 1 ran 15-27 Aug).
const PAST_WINDOW_DAYS = 15;

// Patches one fixture in place across the matchday-grouped structure --
// used for the Realtime update below, so a live score/status change
// doesn't need a full refetch (which would also reset scroll position and
// briefly show a loading state for an update that's really just one row).
function applyFixtureUpdate(matchdays, updated) {
  return matchdays.map((group) => ({
    ...group,
    games: group.games.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)),
  }));
}

// Same grouping used by both the initial load and refetch()/pull-to-refresh
// below -- sorted by each group's earliest kickoff, not the raw matchday
// number: confirmed live that football-data.org's own matchday field
// doesn't always track calendar order (a fully rescheduled round can end up
// dated entirely before the round "before" it), and sorting by the number
// alone showed "2ª giornata" above "1ª giornata" with genuinely earlier
// dates. games within each group are already ascending by kickoff_at from
// the query's own .order() below, so games[0] is that group's earliest.
function groupByMatchday(rows) {
  const byMatchday = new Map();
  for (const fixture of rows) {
    const key = fixture.matchday ?? 0;
    if (!byMatchday.has(key)) byMatchday.set(key, []);
    byMatchday.get(key).push(fixture);
  }
  return [...byMatchday.entries()]
    .map(([matchday, games]) => ({ matchday, games }))
    .sort((a, b) => new Date(a.games[0].kickoff_at) - new Date(b.games[0].kickoff_at));
}

// Groups fixtures by matchday, sorted ascending. home_club_id/away_club_id
// are resolved against the caller's clubs list (see useClubs), same
// pattern as useTransfers, rather than an embedded Postgrest select.
//
// Bounded to a rolling window (past few days -> the sync horizon ahead)
// rather than every fixture ever synced for the league -- fixtures rows
// are never deleted, so an unbounded query would keep growing over a
// season and (worse) "current matchday" picked as "the lowest matchday
// number present" would get stuck on matchday 1 forever once a few
// rounds have been played. See useFixtures.js's pickCurrentMatchday in
// FixturesTab.jsx for how "current" is actually determined now.
export function useFixtures(leagueSlug) {
  const leagueId = useLeagueId(leagueSlug);
  const [matchdays, setMatchdays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const buildQuery = useCallback(() => {
    const cutoff = new Date(Date.now() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return supabase
      .from('fixtures')
      .select('id, matchday, home_club_id, away_club_id, kickoff_at, status, home_score, away_score, referee')
      .eq('league_id', leagueId)
      .gte('kickoff_at', cutoff)
      .order('kickoff_at', { ascending: true });
  }, [leagueId]);

  useEffect(() => {
    if (leagueId == null) return;
    let cancelled = false;
    setLoading(true);

    buildQuery().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('Failed to load fixtures for league', leagueSlug, error);
        setMatchdays([]);
      } else {
        setMatchdays(groupByMatchday(data));
      }
      setLoading(false);
    });

    // Live scores land here via syncLiveScores.js's ~75s poll loop (see
    // that file) writing status/home_score/away_score to this same row --
    // subscribing to Postgres changes means an already-open tab reflects a
    // live goal within that same window instead of only on the next
    // manual reload. Filtered server-side to this league so a goal
    // elsewhere doesn't wake up every open tab watching a different one.
    const channel = supabase
      .channel(`fixtures-${leagueId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fixtures', filter: `league_id=eq.${leagueId}` },
        (payload) => {
          if (cancelled) return;
          setMatchdays((prev) => applyFixtureUpdate(prev, payload.new));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [leagueId, leagueSlug, buildQuery]);

  // Re-queries Supabase directly for pull-to-refresh -- same rationale as
  // useTransfers.js's own refetch(): this never touches football-data.org
  // or GOAL API, just re-reads whatever the last sync already stored.
  const refetch = useCallback(async () => {
    if (leagueId == null) return;
    setRefreshing(true);
    const { data, error } = await buildQuery();
    if (error) {
      console.error('Failed to refresh fixtures for league', leagueSlug, error);
    } else {
      setMatchdays(groupByMatchday(data));
    }
    setRefreshing(false);
  }, [leagueId, leagueSlug, buildQuery]);

  return { matchdays, loading, refreshing, refetch };
}
