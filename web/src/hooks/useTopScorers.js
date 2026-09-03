import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

export function useTopScorers(league) {
  const [scorers, setScorers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScorers() {
      setLoading(true);
      try {
        const { data: leagues } = await supabase
          .from('leagues')
          .select('id')
          .eq('slug', league)
          .single();

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
      } finally {
        setLoading(false);
      }
    }

    fetchScorers();
  }, [league]);

  return { scorers, loading };
}
