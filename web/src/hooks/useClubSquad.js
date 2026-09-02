import { useEffect, useState } from 'react';

// Squad is fetched live from the get-team-squad Edge Function (GOAL API's
// own real photos + season stats), not from a Supabase table the way
// every other hook in this app works -- see that function's own comment:
// pre-syncing every club's full squad on a schedule would burn far more of
// the shared daily GOAL API budget than fetching only the handful of clubs
// a session actually opens.
const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-team-squad`;

export function useClubSquad(clubId) {
  const [club, setClub] = useState(null);
  const [squad, setSquad] = useState([]);
  const [squadAvailable, setSquadAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (clubId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${FUNCTION_URL}?club_id=${clubId}`, {
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
        } else {
          setClub(data.club);
          setSquad(data.squad ?? []);
          setSquadAvailable(data.squadAvailable !== false);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load club squad', clubId, err);
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clubId]);

  return { club, squad, squadAvailable, loading, error };
}
