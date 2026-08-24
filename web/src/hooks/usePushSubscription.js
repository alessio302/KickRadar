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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supported) {
      setLoading(false);
      return;
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => setSubscribed(!!existing))
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

      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
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

  return { supported, subscribed, loading, error, subscribe, unsubscribe };
}
