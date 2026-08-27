import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// Backed by the head_to_head table (see syncHeadToHead.js), not a live
// query against our own fixtures table -- that only keeps a rolling
// ~60-day window, nowhere near enough since two clubs in the same league
// typically meet just twice a SEASON. head_to_head instead reaches back
// across past seasons via football-data.org's own /head2head endpoint,
// synced in the background; this hook just reads whatever's stored, one
// row per unordered club pair.
export function useHeadToHead(clubIdA, clubIdB) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clubIdA == null || clubIdB == null) return;
    let cancelled = false;
    setLoading(true);
    const [a, b] = clubIdA < clubIdB ? [clubIdA, clubIdB] : [clubIdB, clubIdA];
    supabase
      .from('head_to_head')
      .select('matches')
      .eq('club_id_a', a)
      .eq('club_id_b', b)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load head-to-head for clubs', clubIdA, clubIdB, error);
          setMeetings([]);
        } else {
          setMeetings(data?.matches ?? []);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubIdA, clubIdB]);

  return { meetings, loading };
}
