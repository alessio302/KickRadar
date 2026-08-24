import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useLeagueId } from './useLeagueId.js';

// How far back to include already-played fixtures -- needs to cover a
// full matchday's typical spread (Fri-Mon) so "current matchday" can
// include that round's earlier, already-finished games alongside its
// still-upcoming ones.
const PAST_WINDOW_DAYS = 5;

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

  useEffect(() => {
    if (leagueId == null) return;
    let cancelled = false;
    setLoading(true);

    const cutoff = new Date(Date.now() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    supabase
      .from('fixtures')
      .select('id, matchday, home_club_id, away_club_id, kickoff_at, status, home_score, away_score')
      .eq('league_id', leagueId)
      .gte('kickoff_at', cutoff)
      .order('kickoff_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load fixtures for league', leagueSlug, error);
          setMatchdays([]);
          setLoading(false);
          return;
        }

        const byMatchday = new Map();
        for (const fixture of data) {
          const key = fixture.matchday ?? 0;
          if (!byMatchday.has(key)) byMatchday.set(key, []);
          byMatchday.get(key).push(fixture);
        }
        const grouped = [...byMatchday.entries()]
          .sort(([a], [b]) => a - b)
          .map(([matchday, games]) => ({ matchday, games }));

        setMatchdays(grouped);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [leagueId, leagueSlug]);

  return { matchdays, loading };
}
