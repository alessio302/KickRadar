import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// Mirrors useLineups.js's shape. match_events is only ever populated once,
// right after a fixture finishes (see syncLineups.js) -- no Realtime
// subscription here, since there's nothing to update live: the overlay
// just re-fetches whenever it's opened.
export function useMatchEvents(fixtureId) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (fixtureId == null) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from('match_events')
      .select('club_id, type, minute, player, assist, substituted, created_at')
      .eq('fixture_id', fixtureId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load match events for fixture', fixtureId, error);
          setEvents([]);
          setLoading(false);
          return;
        }
        setEvents(data);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fixtureId]);

  return { events, loading };
}
