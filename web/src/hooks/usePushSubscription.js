import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { ensurePushSubscription, NOTIFICATIONS_DENIED } from '../lib/ensurePushSubscription.js';

export { NOTIFICATIONS_DENIED };

// Transfers and lineup confirmations are two fully independent opt-ins
// (push_subscriptions.notify_transfers / notify_lineups, both default
// true) riding on one underlying browser subscription -- confirmed live
// that treating transfer push as "subscription exists, no dedicated
// column" made the two SettingsTab toggles look synchronized: creating
// the subscription via either toggle satisfied both toggles' on-condition
// at once, since the other column's fresh-row default is also true. Each
// preference now reads/writes its own column and never touches the
// other's local state.
//
// `subscribed` tracks the browser's own PushManager state (source of
// truth for "is there an active subscription at all"), not something
// stored server-side, since there's no login system here to key
// server-side state on. The subscription itself is deliberately never
// torn down from here -- turning both preferences off just stops any
// push from being sent, the row stays so re-enabling either one doesn't
// need to re-subscribe.
export function usePushSubscription() {
  const [supported] = useState(
    () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
  );
  const [subscribed, setSubscribed] = useState(false);
  const [notifyTransfers, setNotifyTransfersState] = useState(true);
  const [notifyLineups, setNotifyLineupsState] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supported) {
      setLoading(false);
      return;
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (existing) => {
        setSubscribed(!!existing);
        if (existing) {
          const { endpoint, keys } = existing.toJSON();
          // RPC, not a direct table select: push_subscriptions has no
          // select policy (see sql/012_push_subscriptions_rpc.sql), only
          // this endpoint+auth-scoped function, so a stray anon-key query
          // elsewhere in the codebase could never enumerate other users'
          // rows.
          const { data } = await supabase
            .rpc('get_push_preferences', { p_endpoint: endpoint, p_auth: keys.auth })
            .maybeSingle();
          if (data) {
            setNotifyTransfersState(data.notify_transfers);
            setNotifyLineupsState(data.notify_lineups);
          }
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [supported]);

  const ensureSubscribed = useCallback(async () => {
    const subscription = await ensurePushSubscription();
    setSubscribed(true);
    return subscription;
  }, []);

  const setNotifyTransfers = useCallback(async (value) => {
    setError(null);
    try {
      const subscription = await ensureSubscribed();
      const { endpoint, keys } = subscription.toJSON();
      const { error: updateErr } = await supabase.rpc('set_push_preference', {
        p_endpoint: endpoint,
        p_auth: keys.auth,
        p_notify_transfers: value,
      });
      if (updateErr) throw updateErr;
      setNotifyTransfersState(value);
    } catch (err) {
      setError(err.message);
    }
  }, [ensureSubscribed]);

  const setNotifyLineups = useCallback(async (value) => {
    setError(null);
    try {
      const subscription = await ensureSubscribed();
      const { endpoint, keys } = subscription.toJSON();
      const { error: updateErr } = await supabase.rpc('set_push_preference', {
        p_endpoint: endpoint,
        p_auth: keys.auth,
        p_notify_lineups: value,
      });
      if (updateErr) throw updateErr;
      setNotifyLineupsState(value);
    } catch (err) {
      setError(err.message);
    }
  }, [ensureSubscribed]);

  return { supported, subscribed, notifyTransfers, notifyLineups, loading, error, setNotifyTransfers, setNotifyLineups };
}
