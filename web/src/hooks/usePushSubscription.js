import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// PushManager.subscribe() needs the VAPID public key as a raw Uint8Array,
// not the base64url string it's normally handed around as.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Sentinel thrown for the one error case that's a normal, expected user
// action (declining the permission prompt) rather than a rare technical
// fault -- lets SettingsTab map it to a translated message via
// t.errors.notificationsDenied. Other errors here (missing env var,
// Supabase failures) surface as their raw, untranslated message; that gap
// is a known, accepted scope limit for now, not something this sentinel
// needs to solve too.
export const NOTIFICATIONS_DENIED = 'notifications-denied';

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

  // Creates the browser subscription + DB row if one doesn't exist yet,
  // otherwise returns the existing one. Both preference setters call this
  // first -- a preference is meaningless without an active subscription.
  const ensureSubscribed = useCallback(async () => {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error(NOTIFICATIONS_DENIED);
    }

    // .trim(): a stray trailing newline/space in the env var value (easy
    // to introduce via copy-paste into a dashboard's env var field) makes
    // atob() throw "The string contains invalid characters" -- confirmed
    // live -- since atob is far stricter about whitespace than most other
    // base64 decoders.
    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
    if (!vapidPublicKey) throw new Error('Missing VITE_VAPID_PUBLIC_KEY.');

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    const { endpoint, keys } = subscription.toJSON();
    const { error: upsertErr } = await supabase.rpc('upsert_push_subscription', {
      p_endpoint: endpoint,
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
    });
    if (upsertErr) throw upsertErr;

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
