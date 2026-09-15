import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// Name-keyed counterpart to useHeadToHead.js -- backed by the
// european_head_to_head table (sql/058, see syncEuropeanHeadToHead.js),
// not a live query against our own fixtures table for the same reason
// useHeadToHead.js isn't: that only keeps a rolling window, nowhere near
// enough for two teams that might last have met a season or more ago.
export function useEuropaHeadToHead(teamNameA, teamNameB) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamNameA || !teamNameB) return;
    let cancelled = false;
    setLoading(true);
    const [a, b] = teamNameA < teamNameB ? [teamNameA, teamNameB] : [teamNameB, teamNameA];
    supabase
      .from('european_head_to_head')
      .select('matches')
      .eq('team_name_a', a)
      .eq('team_name_b', b)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load Europa head-to-head for', teamNameA, teamNameB, error);
          setMeetings([]);
        } else {
          setMeetings(data?.matches ?? []);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamNameA, teamNameB]);

  return { meetings, loading };
}
