import { supabase } from './supabaseClient.js';

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
// fault -- lets a caller map it to a translated message via
// t.errors.notificationsDenied.
export const NOTIFICATIONS_DENIED = 'notifications-denied';

// Creates the browser subscription + DB row if one doesn't exist yet,
// otherwise returns the existing one. Used by usePushSubscription.js
// (the two blanket notify_transfers/notify_lineups toggles) as a
// precondition before it can write anything.
export async function ensurePushSubscription() {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(NOTIFICATIONS_DENIED);
  }

  // .trim(): a stray trailing newline/space in the env var value (easy to
  // introduce via copy-paste into a dashboard's env var field) makes
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

  return subscription;
}
