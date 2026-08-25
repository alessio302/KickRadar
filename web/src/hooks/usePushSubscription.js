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

function subscriptionRow(subscription) {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    updated_at: new Date().toISOString(),
  };
}

// Tracks whether push is supported at all, and whether this browser is
// currently subscribed -- reflects the browser's own PushManager state
// (source of truth), not a preference stored server-side, since there's no
// login system here to key server-side state on.
export function usePushSubscription() {
  const [supported] = useState(
    () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
  );
  const [subscribed, setSubscribed] = useState(false);
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
        // notify_lineups is a per-category preference on the stored
        // subscription row, not something the browser's own PushManager
        // knows about -- read it from Supabase, defaulting to the
        // column's own default (true) if there's no subscription yet.
        if (existing) {
          const { endpoint } = existing.toJSON();
          const { data } = await supabase.from('push_subscriptions').select('notify_lineups').eq('endpoint', endpoint).maybeSingle();
          if (data) setNotifyLineupsState(data.notify_lineups);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [supported]);

  const subscribe = useCallback(async () => {
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Benachrichtigungen wurden nicht erlaubt.');
        return;
      }

      // .trim(): a stray trailing newline/space in the env var value (easy
      // to introduce via copy-paste into a dashboard's env var field) makes
      // atob() throw "The string contains invalid characters" -- confirmed
      // live -- since atob is far stricter about whitespace than most other
      // base64 decoders.
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
      if (!vapidPublicKey) throw new Error('Missing VITE_VAPID_PUBLIC_KEY.');

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const { error: upsertErr } = await supabase
        .from('push_subscriptions')
        .upsert(subscriptionRow(subscription), { onConflict: 'endpoint' });
      if (upsertErr) throw upsertErr;

      setSubscribed(true);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const { endpoint } = subscription.toJSON();
        await subscription.unsubscribe();
        const { error: deleteErr } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
        if (deleteErr) throw deleteErr;
      }
      setSubscribed(false);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const setNotifyLineups = useCallback(
    async (value) => {
      setError(null);
      try {
        let registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          // A lineup-push preference is meaningless without an active
          // subscription -- toggling this on before ever subscribing to
          // transfers subscribes first, same flow as that toggle.
          await subscribe();
          registration = await navigator.serviceWorker.ready;
          subscription = await registration.pushManager.getSubscription();
          if (!subscription) return; // subscribe() already recorded an error
        }
        const { endpoint } = subscription.toJSON();
        const { error: updateErr } = await supabase.from('push_subscriptions').update({ notify_lineups: value }).eq('endpoint', endpoint);
        if (updateErr) throw updateErr;
        setNotifyLineupsState(value);
      } catch (err) {
        setError(err.message);
      }
    },
    [subscribe]
  );

  return { supported, subscribed, notifyLineups, loading, error, subscribe, unsubscribe, setNotifyLineups };
}
