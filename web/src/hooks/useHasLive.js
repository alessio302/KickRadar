import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const UEFA_SLUGS = ['champions-league', 'europa-league', 'conference-league'];

// Returns whether any live fixtures exist for domestic leagues vs. UEFA
// competitions, so BottomNav can show red indicator dots on Spiele and
// Europa icons regardless of which tab is currently active.
//
// Single SELECT on `fixtures` (status='live') joined against the leagues
// table to separate UEFA from domestic -- one channel, same wake-on-
// visibilitychange/focus pattern as useLiveFixtures.js. UEFA league ids
// are fetched once and reused for the life of the effect.
export function useHasLive() {
  const [hasDomestic, setHasDomestic] = useState(false);
  const [hasEuropa, setHasEuropa] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let uefaIds = null;

    const load = async () => {
      if (!uefaIds) {
        const { data } = await supabase.from('leagues').select('id').in('slug', UEFA_SLUGS);
        uefaIds = new Set((data ?? []).map((l) => l.id));
      }
      const { data: rows } = await supabase.from('fixtures').select('league_id').eq('status', 'live');
      if (cancelled) return;
      let dom = false;
      let euro = false;
      for (const r of rows ?? []) {
        if (uefaIds.has(r.league_id)) euro = true;
        else dom = true;
        if (dom && euro) break;
      }
      setHasDomestic(dom);
      setHasEuropa(euro);
    };

    load();

    const channel = supabase
      .channel('has-live-indicator')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fixtures' }, () => {
        if (!cancelled) load();
      })
      .subscribe();

    function handleWake() {
      if (!cancelled && document.visibilityState === 'visible') load();
    }
    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('focus', handleWake);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('focus', handleWake);
    };
  }, []);

  return { hasDomestic, hasEuropa };
}
