import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// League ids never change at runtime (fixed set of 4), so a simple
// module-level cache avoids re-querying on every tab/component mount.
const cache = new Map();

export function useLeagueId(slug) {
  const [id, setId] = useState(cache.get(slug) ?? null);

  useEffect(() => {
    if (cache.has(slug)) {
      setId(cache.get(slug));
      return;
    }
    let cancelled = false;
    supabase
      .from('leagues')
      .select('id')
      .eq('slug', slug)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to resolve league id for', slug, error);
          return;
        }
        cache.set(slug, data.id);
        setId(data.id);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return id;
}
