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

const SELECT = 'id, club_id, team_name, type, minute, player, assist, substituted, created_at';
// Same rationale as useLineups.js's own POLL_MS: Realtime alone has already
// proven unreliable in this app, and this is the one place that absolutely
// must not silently miss anything (a goal). Also incidentally covers a gap
// the subscription below doesn't: it only listens for INSERT/UPDATE, not
// DELETE, so a VAR-retracted goal (syncLiveEvents.js does delete confirmed-
// stale rows, see that file's own comment) wouldn't disappear from an
// already-open overlay without this -- load() below does a full resync,
// not a merge, so a deleted row drops out on the next poll same as it
// would on a fresh open.
const POLL_MS = 30000;

export function useMatchEvents(fixtureId) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (fixtureId == null) return;
    let cancelled = false;

    const load = () =>
      supabase
        .from('match_events')
        .select(SELECT)
        .eq('fixture_id', fixtureId)
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            console.error('Failed to load match events for fixture', fixtureId, error);
            setEvents([]);
            return;
          }
          setEvents(data);
        });

    setLoading(true);
    load().finally(() => {
      if (!cancelled) setLoading(false);
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

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fixtureId]);

  return { events, loading };
}
