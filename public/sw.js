/* Ordsamling service worker — Web Push only.
 * No app-shell caching: HTML and assets continue to be served fresh from the network.
 * This worker exists solely to receive push events on iOS 16.4+/Android/desktop and
 * relay them to the OS notification center.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try {
      payload = { body: event.data ? event.data.text() : '' };
    } catch {
      payload = {};
    }
  }

  const title = payload.title || 'Ordsamling';
  const options = {
    body: payload.body || 'Time to practice a few words.',
    icon: '/apple-touch-icon.png',
    badge: '/favicon-32.png',
    data: { url: payload.url || '/' },
    tag: payload.tag || 'ordsamling-reminder',
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            await client.focus();
            if ('navigate' in client) {
              await client.navigate(targetUrl);
            }
            return;
          }
        } catch {
          /* ignore malformed client URLs */
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
