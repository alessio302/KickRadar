import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// All clubs across all 4 leagues, grouped by league slug -- used for the
// "Lieblingsverein" dropdown in Settings, which (per the briefing) is a
// single global favorite, not scoped to whatever league is currently open.
export function useAllClubs() {
  const [byLeague, setByLeague] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('clubs')
      .select('id, name, short_code, crest_url, leagues(slug, name)')
      .order('name')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load all clubs', error);
          setByLeague({});
          setLoading(false);
          return;
        }
        const grouped = {};
        for (const club of data) {
          const slug = club.leagues?.slug;
          if (!slug) continue;
          (grouped[slug] = grouped[slug] || { label: club.leagues.name, clubs: [] }).clubs.push({
            id: club.id,
            name: club.name,
            short_code: club.short_code,
            crest_url: club.crest_url,
            league_slug: slug,
          });
        }
        setByLeague(grouped);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { byLeague, loading };
}
