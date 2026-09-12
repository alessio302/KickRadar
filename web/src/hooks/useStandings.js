import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useLeagueId } from './useLeagueId.js';

// Same module-level warm-start cache as useClubs.js -- see that file's
// comment for why (the league swipe carousel in useLeagueCarousel.js).
const cache = new Map();

// Full current-season table for one league, TOTAL group only -- see
// syncStandings.js's own comment for why there's no HOME/AWAY split or
// form string on the free tier. Overwritten in place on every sync, so
// unlike useFixtures.js there's no windowing here: this is always "the
// whole table as of the last sync."
export function useStandings(leagueSlug) {
  const leagueId = useLeagueId(leagueSlug);
  const [table, setTable] = useState(() => cache.get(leagueId) ?? []);
  const [loading, setLoading] = useState(() => leagueId == null || !cache.has(leagueId));

  const buildQuery = useCallback(() => {
    return supabase
      .from('standings')
      .select('club_id, position, played, won, draw, lost, points, goals_for, goals_against, goal_difference')
      .eq('league_id', leagueId)
      .order('position', { ascending: true });
  }, [leagueId]);

  useEffect(() => {
    if (leagueId == null) return;
    let cancelled = false;
    const cached = cache.get(leagueId);
    if (cached) {
      setTable(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    buildQuery().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('Failed to load standings for league', leagueSlug, error);
        if (!cached) setTable([]);
      } else {
        cache.set(leagueId, data);
        setTable(data);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [leagueId, leagueSlug, buildQuery]);

  // Re-queries Supabase directly for pull-to-refresh -- same rationale as
  // useFixtures.js's own refetch(): this never touches football-data.org,
  // just re-reads whatever the last sync already stored.
  const refetch = useCallback(async () => {
    if (leagueId == null) return;
    const { data, error } = await buildQuery();
    if (error) {
      console.error('Failed to refresh standings for league', leagueSlug, error);
    } else {
      cache.set(leagueId, data);
      setTable(data);
    }
  }, [leagueId, leagueSlug, buildQuery]);

  return { table, loading, refetch };
}
