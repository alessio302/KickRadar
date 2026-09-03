import { useEffect, useState } from 'react';
import { useSupabase } from './useSupabase.js';

export function useTopScorers(league) {
  const supabase = useSupabase();
  const [scorers, setScorers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
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

    fetch();
  }, [supabase, league]);

  return { scorers, loading };
}
