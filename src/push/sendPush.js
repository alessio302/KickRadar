import webpush from 'web-push';
import { getSupabaseClient } from '../db/supabaseClient.js';

// VAPID identifies the sender to the browser's push service (Apple/Google) --
// required by the Web Push protocol, not something specific to this app.
// The subject is a contact URL/mailto the push service can use if a
// subscriber reports abuse; a plain URL avoids needing a personal email
// here. Free: Web Push itself has no cost or paid tier, per the project's
// "stay free" constraint -- it rides on the browser vendors' own
// infrastructure (APNs for Safari/iOS, FCM for Chrome/Android).
let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY env vars.');
  }
  const subject = process.env.VAPID_SUBJECT || 'https://kick-radar-eosin.vercel.app';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

// Sends the same notification to every stored subscription. A subscription
// that comes back 404/410 (browser unsubscribed, or the token expired) is
// removed -- otherwise every future send would keep retrying a dead
// endpoint forever.
export async function sendPushToAll(payload) {
  ensureConfigured();
  const supabase = getSupabaseClient();

  const { data: subs, error } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth');
  if (error) throw error;
  if (subs.length === 0) return { sent: 0, failed: 0, removed: 0 };

  let sent = 0;
  let failed = 0;
  const staleIds = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        staleIds.push(sub.id);
      } else {
        failed += 1;
        console.error('Push send failed:', err.message);
      }
    }
  }

  if (staleIds.length > 0) {
    const { error: deleteErr } = await supabase.from('push_subscriptions').delete().in('id', staleIds);
    if (deleteErr) console.error('Failed to remove stale push subscriptions:', deleteErr.message);
  }

  return { sent, failed, removed: staleIds.length };
}
