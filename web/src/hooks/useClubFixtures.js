import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// Upcoming fixtures for one club, for the club-detail overlay's "Anstehende
// Spiele" tab -- reads the same fixtures table useFixtures.js already
// syncs, just scoped to one club and the future, so no new sync job or
// provider call is needed for this tab (unlike the squad tab, which goes
// through the live get-team-squad Edge Function).
export function useClubFixtures(clubId) {
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clubId == null) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from('fixtures')
      .select('id, matchday, home_club_id, away_club_id, kickoff_at, status, home_score, away_score, live_minute')
      .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
      .gte('kickoff_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('kickoff_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load club fixtures', clubId, error);
          setFixtures([]);
        } else {
          setFixtures(data);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clubId]);

  return { fixtures, loading };
}
