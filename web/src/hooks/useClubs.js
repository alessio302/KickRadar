import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useLeagueId } from './useLeagueId.js';

// Same module-level cache-by-leagueId pattern as useLeagueId.js itself --
// crucial for the league swipe carousel (see useLeagueCarousel.js):
// re-mounting a previously-visited league's page should hydrate instantly
// from here instead of re-querying and showing a "Lädt..." flash, since
// that page's data was typically already fetched once while it was being
// dragged into view as the preview panel a moment earlier. Still always
// re-fetches in the background to catch anything that changed meanwhile
// (crest updates, a club rename) -- this is a warm start, not a
// permanent cache.
const cache = new Map();

export function useClubs(leagueSlug) {
  const leagueId = useLeagueId(leagueSlug);
  const [clubs, setClubs] = useState(() => cache.get(leagueId) ?? []);
  const [loading, setLoading] = useState(() => leagueId == null || !cache.has(leagueId));

  useEffect(() => {
    if (leagueId == null) return;
    let cancelled = false;
    const cached = cache.get(leagueId);
    if (cached) {
      setClubs(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    supabase
      .from('clubs')
      .select('id, name, short_code, short_name, venue, crest_url')
      .eq('league_id', leagueId)
      .order('name')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load clubs for league', leagueSlug, error);
          if (!cached) setClubs([]);
        } else {
          cache.set(leagueId, data);
          setClubs(data);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, leagueSlug]);

  return { clubs, loading };
}
