/* Service Worker — Relationship diary */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// ── Push: display notification ────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;

  let payload;
  try { payload = e.data.json(); }
  catch { payload = { title: 'Дневник', body: e.data.text() }; }

  const { title, body, icon = '/icons/icon-192.png', badge, url = '/' } = payload;

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag: 'diary-push',
      renotify: true,
      data: { url },
      vibrate: [100, 50, 100],
    })
  );
});

// ── Notification click: open/focus app ───────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || '/';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const match = clients.find(c => new URL(c.url).origin === self.location.origin);
      if (match) return match.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
