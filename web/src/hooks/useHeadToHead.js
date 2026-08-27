import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const H2H_LIMIT = 5;

// Past meetings between exactly these two clubs, most recent first. Early
// in a season (or for two clubs that rarely cross paths across seasons)
// this can come back empty -- callers show an empty state rather than
// treating that as an error.
export function useHeadToHead(clubIdA, clubIdB) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clubIdA == null || clubIdB == null) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('fixtures')
      .select('id, home_club_id, away_club_id, home_score, away_score, kickoff_at')
      .eq('status', 'finished')
      .or(
        `and(home_club_id.eq.${clubIdA},away_club_id.eq.${clubIdB}),and(home_club_id.eq.${clubIdB},away_club_id.eq.${clubIdA})`
      )
      .order('kickoff_at', { ascending: false })
      .limit(H2H_LIMIT)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load head-to-head for clubs', clubIdA, clubIdB, error);
          setMeetings([]);
          setLoading(false);
          return;
        }
        setMeetings(data);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubIdA, clubIdB]);

  return { meetings, loading };
}
