import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

export function useTopScorers(league) {
  const [scorers, setScorers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchScorers = useCallback(async () => {
    try {
      const { data: leagues } = await supabase.from('leagues').select('id').eq('slug', league).single();
      if (leagues?.id) {
        const { data, error } = await supabase
          .from('top_scorers')
          .select('*')
          .eq('league_id', leagues.id)
          .order('rank', { ascending: true });

        if (error) throw error;
        setScorers(data ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch top scorers:', err);
      setScorers([]);
    }
  }, [league]);

  useEffect(() => {
    setLoading(true);
    fetchScorers().finally(() => setLoading(false));
  }, [fetchScorers]);

  // Re-queries Supabase directly for pull-to-refresh -- same rationale as
  // useFixtures.js's own refetch(): this never touches football-data.org,
  // just re-reads whatever the last sync already stored.
  return { scorers, loading, refetch: fetchScorers };
}
