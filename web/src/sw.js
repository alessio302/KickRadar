import { precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);

// Missing until now, and likely why the last several deploys never
// actually reached the device under test: this is a fully custom service
// worker (switched from vite-plugin-pwa's auto-generated one to add the
// push/notificationclick handlers below), which doesn't come with
// generateSW's built-in "activate immediately" lifecycle -- without these,
// a new SW version sits in "waiting" until every open instance of the app
// is completely closed, which on iOS a backgrounded (not force-quit) PWA
// never truly is. skipWaiting() + clients.claim() make a newly installed
// SW take over immediately instead.
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'KickRadar', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'KickRadar';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Confirmed live: focusing an already-open KickRadar window without also
// navigating it left the app showing whatever league was open before --
// not the one the notification was actually about, since the league
// switcher's selection is persisted and survives a background/resume. The
// notification's url (e.g. "/?league=serie-a") carries which league to
// jump to; navigate() applies it to an already-open window, App.jsx reads
// it from the URL on a fresh load.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if ('navigate' in client) {
          try {
            await client.navigate(url);
          } catch {
            // Some browsers refuse to navigate a client that isn't fully
            // controlled yet -- focusing it as-is beats not responding at all.
          }
        }
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});
