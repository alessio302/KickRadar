import webpush from 'web-push';
import { getSupabaseClient } from '../db/supabaseClient.js';
import { SUPPORTED_PUSH_LANGUAGES } from './pushI18n.js';

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
  // .trim(): confirmed live -- a GitHub Actions secret pasted with a
  // trailing newline makes web-push's own validator reject it ("Vapid
  // public key must be a URL safe Base 64"), the same class of bug already
  // hit and fixed for the frontend's VITE_VAPID_PUBLIC_KEY.
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY env vars.');
  }
  const subject = process.env.VAPID_SUBJECT || 'https://kick-radar-eosin.vercel.app';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

async function sendToSubscriptions(supabase, subs, payload) {
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

// Splits subs by their stored language (push_subscriptions.language,
// defaulting unset/unrecognized values to 'de' the same way the frontend's
// detectDefaultLanguage() does) and sends each group the payload variant
// the caller prepared for that language (payloadsByLanguage, keyed by
// language code -- see runNewsScraper.js/syncLineups.js) -- so a
// subscriber gets their notification in the app language they're actually
// using, not whatever language happened to be hardcoded server-side.
async function sendToSubscriptionsByLanguage(supabase, subs, payloadsByLanguage) {
  const groups = new Map();
  for (const sub of subs) {
    const lang = SUPPORTED_PUSH_LANGUAGES.includes(sub.language) ? sub.language : 'de';
    if (!groups.has(lang)) groups.set(lang, []);
    groups.get(lang).push(sub);
  }

  let sent = 0;
  let failed = 0;
  let removed = 0;
  for (const [lang, groupSubs] of groups) {
    const payload = payloadsByLanguage[lang] ?? payloadsByLanguage.de;
    const result = await sendToSubscriptions(supabase, groupSubs, payload);
    sent += result.sent;
    failed += result.failed;
    removed += result.removed;
  }
  return { sent, failed, removed };
}

// Sends to literally every stored subscription, ignoring both category
// preferences -- only for testPush.js's manual pipeline smoke test, never
// for a real notification category. A subscription that comes back
// 404/410 (browser unsubscribed, or the token expired) is removed --
// otherwise every future send would keep retrying a dead endpoint forever.
export async function sendPushToAll(payload) {
  ensureConfigured();
  const supabase = getSupabaseClient();
  const { data: subs, error } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth');
  if (error) throw error;
  return sendToSubscriptions(supabase, subs, payload);
}

// Transfers and lineup confirmations are two fully independent opt-ins on
// top of the same underlying subscription (push_subscriptions.
// notify_transfers / notify_lineups, both default true) -- confirmed live
// that tying transfer push to "subscription exists" alone (no dedicated
// column) made the two toggles in SettingsTab.jsx look synchronized:
// subscribing via either one satisfied both toggles' on-condition at once,
// since a fresh row's other column defaults true regardless of which
// toggle the subscriber actually touched.
export async function sendPushToTransferSubscribers(payloadsByLanguage) {
  ensureConfigured();
  const supabase = getSupabaseClient();
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, language')
    .eq('notify_transfers', true);
  if (error) throw error;
  return sendToSubscriptionsByLanguage(supabase, subs, payloadsByLanguage);
}

export async function sendPushToLineupSubscribers(payloadsByLanguage) {
  ensureConfigured();
  const supabase = getSupabaseClient();
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, language')
    .eq('notify_lineups', true);
  if (error) throw error;
  return sendToSubscriptionsByLanguage(supabase, subs, payloadsByLanguage);
}

// Match events (goals/cards/subs) are the one push category that isn't a
// blanket opt-in/opt-out toggle: there's no "notify_match_events" column,
// only whichever specific fixtures a subscription favorited (see
// favorite_fixtures, sql/026_favorite_fixtures.sql). Targeted by fixture,
// not a boolean column, since two different subscriptions can favorite two
// entirely different sets of matches at once. Runs with the service_role
// key (this whole module does), so it can embed push_subscriptions through
// the FK directly -- no RPC needed here, those exist only for the
// anon-key frontend path.
export async function sendPushToFixtureFavoriters(fixtureId, payloadsByLanguage) {
  ensureConfigured();
  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('favorite_fixtures')
    .select('push_subscriptions(id, endpoint, p256dh, auth, language)')
    .eq('fixture_id', fixtureId);
  if (error) throw error;
  const subs = rows.map((r) => r.push_subscriptions).filter(Boolean);
  return sendToSubscriptionsByLanguage(supabase, subs, payloadsByLanguage);
}
