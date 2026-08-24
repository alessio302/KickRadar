// One-off manual test, not part of the regular pipeline. Sends a test
// notification to every stored subscription, independent of whether any
// new transfer actually exists -- lets the whole pipeline (VAPID keys,
// web-push, delivery to a real device) be verified on demand instead of
// waiting for real news to trigger it via runNewsScraper.js.
import { sendPushToAll } from './sendPush.js';

async function main() {
  const result = await sendPushToAll({
    title: 'KickRadar Test',
    body: 'Wenn du das siehst, funktionieren Push-Benachrichtigungen.',
    url: '/',
  });
  console.log('Test push result:', result);
}

main().catch((err) => {
  console.error('Test push failed:', err);
  process.exitCode = 1;
});
