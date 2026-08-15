// Real Web Push service worker for the SiteSpark web app -- registered by expo-notifications
// (see app.config.js's notification.serviceWorkerPath) the first time a signed-in user grants
// notification permission. Firebase Cloud Functions send through Expo's push API exactly the
// same way as native iOS pushes (see src/services/pushNotifications.ts /
// firebase/functions/src/pushApi.ts) -- Expo's push service relays it to this browser's real
// push endpoint using the VAPID keys registered for this project.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// expo-notifications posts a small message to the active service worker once it registers
// (see getDevicePushTokenAsync.web.ts) -- currently just a marker; kept so future icon
// customization has somewhere to read from without a client-side code change here.
self.addEventListener('message', () => {});

self.addEventListener('push', (event) => {
  let payload = { title: 'SiteSpark', body: '' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  const title = payload.title || 'SiteSpark';
  const options = {
    body: payload.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: payload.data || {},
    tag: payload.data && payload.data.tag ? String(payload.data.tag) : undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Focuses an already-open SiteSpark tab if there is one, otherwise opens a new one --
// matches how tapping a native push opens the app instead of leaving it backgrounded.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
      return undefined;
    })
  );
});
