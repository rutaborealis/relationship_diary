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

  e.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag: 'diary-push',
      renotify: true,
      data: { url },
      vibrate: [100, 50, 100],
    });
    // App-icon badge over the installed PWA icon (count of active notifications).
    try {
      const notifs = await self.registration.getNotifications();
      await self.navigator.setAppBadge?.(notifs.length || 1);
    } catch { /* Badging API unsupported / app not installed */ }
  })());
});

// ── Notification click: open/focus app ───────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || '/';

  e.waitUntil((async () => {
    // Tapping the notification closes it — sync the app-icon badge accordingly.
    try {
      const notifs = await self.registration.getNotifications();
      if (notifs.length) await self.navigator.setAppBadge?.(notifs.length);
      else await self.navigator.clearAppBadge?.();
    } catch { /* Badging API unsupported */ }

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const match = clients.find(c => new URL(c.url).origin === self.location.origin);
    if (match) return match.focus();
    return self.clients.openWindow(targetUrl);
  })());
});
