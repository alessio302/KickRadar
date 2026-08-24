import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useLeagueId } from './useLeagueId.js';

// Groups fixtures by matchday, sorted ascending -- callers slice to the
// first group for "next matchday only". home_club_id/away_club_id are
// resolved against the caller's clubs list (see useClubs), same pattern as
// useTransfers, rather than an embedded Postgrest select.
export function useFixtures(leagueSlug) {
  const leagueId = useLeagueId(leagueSlug);
  const [matchdays, setMatchdays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (leagueId == null) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from('fixtures')
      .select('id, matchday, home_club_id, away_club_id, kickoff_at, status, home_score, away_score')
      .eq('league_id', leagueId)
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
