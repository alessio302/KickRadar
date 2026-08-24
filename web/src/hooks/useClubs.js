import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useLeagueId } from './useLeagueId.js';

export function useClubs(leagueSlug) {
  const leagueId = useLeagueId(leagueSlug);
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (leagueId == null) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('clubs')
      .select('id, name, short_code')
      .eq('league_id', leagueId)
      .order('name')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load clubs for league', leagueSlug, error);
          setClubs([]);
        } else {
          setClubs(data);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, leagueSlug]);

  return { clubs, loading };
}
