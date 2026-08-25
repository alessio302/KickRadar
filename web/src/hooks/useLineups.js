import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// Nothing writes to the `lineups` table yet (the Highlightly sync is still
// being verified, see backend README) -- this always resolves to an empty
// map for now, which the overlay reads as "not yet available". No
// frontend change will be needed once the sync exists; rows just start
// showing up.
export function useLineups(fixtureId) {
  const [byClubId, setByClubId] = useState(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (fixtureId == null) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from('lineups')
      .select('club_id, confirmed, formation, players, published_at')
      .eq('fixture_id', fixtureId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load lineups for fixture', fixtureId, error);
          setByClubId(new Map());
          setLoading(false);
          return;
        }
        setByClubId(new Map(data.map((row) => [row.club_id, row])));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fixtureId]);

  return { byClubId, loading };
}
