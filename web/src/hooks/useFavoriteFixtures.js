import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { ensurePushSubscription } from '../lib/ensurePushSubscription.js';

// Favoriting a fixture (swipe action on its card, see FixturesTab.jsx)
// gets you push notifications for its live events (goals/cards/subs, see
// matchEventNotifier.js). Tied to the push subscription itself, same as
// every other push preference in this app -- there's no login system, so
// "favorite" only means anything once a subscription exists; toggling a
// favorite silently creates one first (same permission-prompt flow as the
// Settings toggles) rather than failing outright.
export function useFavoriteFixtures() {
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (existing) => {
        if (!existing) return;
        const { endpoint, keys } = existing.toJSON();
        const { data } = await supabase.rpc('get_favorite_fixture_ids', { p_endpoint: endpoint, p_auth: keys.auth });
        if (data) setFavoriteIds(new Set(data.map((r) => r.fixture_id)));
      })
      .catch((err) => setError(err.message));
  }, []);

  // Returns 'added' | 'removed' on success (so the caller can show the
  // right toast text) or throws -- NOTIFICATIONS_DENIED when push
  // permission was declined, or a raw Supabase error message otherwise.
  const toggleFavorite = useCallback(async (fixtureId) => {
    setError(null);
    try {
      const subscription = await ensurePushSubscription();
      const { endpoint, keys } = subscription.toJSON();
      const alreadyFavorite = favoriteIds.has(fixtureId);
      const rpc = alreadyFavorite ? 'remove_favorite_fixture' : 'add_favorite_fixture';
      const { error: rpcErr } = await supabase.rpc(rpc, { p_endpoint: endpoint, p_auth: keys.auth, p_fixture_id: fixtureId });
      if (rpcErr) throw rpcErr;

      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (alreadyFavorite) next.delete(fixtureId);
        else next.add(fixtureId);
        return next;
      });
      return alreadyFavorite ? 'removed' : 'added';
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [favoriteIds]);

  return { favoriteIds, toggleFavorite, error };
}
