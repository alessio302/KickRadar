import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const SELECT = 'fixture_id, club_id, confirmed, formation, players, published_at';

// Rows are written by src/lineups/syncLineups.js once a fixture's lineup
// is confirmed (or stays absent until then, which the overlay reads as
// "not yet available"). syncLineups.js only runs every 15 minutes, so a
// lineup can easily get confirmed *while* the overlay is already open and
// showing "not yet available" -- confirmed live: this hook used to fetch
// once on mount and never again, with no Realtime subscription and no
// poll, so that overlay never found out short of the user closing and
// reopening it. Realtime (sql/056_lineups_realtime.sql) covers the normal
// case; the poll below is a fallback for exactly the same reason
// useFixtures.js/useLiveFixtures.js/useEuropaFixtures.js all ended up with
// one too -- Realtime alone has already proven unreliable in this app
// (dropped/missed postgres_changes deliveries), not a hypothetical here.
const POLL_MS = 30000;

export function useLineups(fixtureId) {
  const [byClubId, setByClubId] = useState(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (fixtureId == null) return;
    let cancelled = false;

    const load = () =>
      supabase
        .from('lineups')
        .select(SELECT)
        .eq('fixture_id', fixtureId)
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            console.error('Failed to load lineups for fixture', fixtureId, error);
            setByClubId(new Map());
            return;
          }
          setByClubId(new Map(data.map((row) => [row.club_id, row])));
        });

    setLoading(true);
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });

    const channel = supabase
      .channel(`lineups-${fixtureId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lineups', filter: `fixture_id=eq.${fixtureId}` },
        (payload) => {
          if (cancelled) return;
          setByClubId((prev) => new Map(prev).set(payload.new.club_id, payload.new));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lineups', filter: `fixture_id=eq.${fixtureId}` },
        (payload) => {
          if (cancelled) return;
          setByClubId((prev) => new Map(prev).set(payload.new.club_id, payload.new));
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

  return { byClubId, loading };
}
