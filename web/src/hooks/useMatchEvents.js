import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// Merges one Realtime row into the existing list by id -- covers both a
// genuinely new event (INSERT) and src/lineups/syncLiveEvents.js re-upserting
// an already-seen live event with an updated field (Postgres delivers that as
// an UPDATE even though the row's event_key didn't change), so a duplicate
// never lands in the list either way.
function applyEventChange(events, row) {
  const idx = events.findIndex((e) => e.id === row.id);
  if (idx === -1) return [...events, row];
  const next = [...events];
  next[idx] = row;
  return next;
}

export function useMatchEvents(fixtureId) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (fixtureId == null) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from('match_events')
      .select('id, club_id, type, minute, player, assist, substituted, created_at')
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

    // src/lineups/syncLiveEvents.js writes goals/cards/subs here while a
    // match is still live (not just once it's finished, like the older
    // REST-only path) -- subscribing means an already-open overlay shows a
    // goal within its ~WS push cadence instead of only after the match ends.
    const channel = supabase
      .channel(`match-events-${fixtureId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_events', filter: `fixture_id=eq.${fixtureId}` },
        (payload) => {
          if (cancelled) return;
          setEvents((prev) => applyEventChange(prev, payload.new));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'match_events', filter: `fixture_id=eq.${fixtureId}` },
        (payload) => {
          if (cancelled) return;
          setEvents((prev) => applyEventChange(prev, payload.new));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [fixtureId]);

  return { events, loading };
}
