/* Service Worker — Relationship diary */
const CACHE = 'diary-v1';
const SHELL = ['/', '/style.css', '/app.js', '/manifest.json'];

// ── Install: cache app shell ──────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for API, cache-first for shell ──────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (url.pathname.startsWith('/api/')) return; // never cache API

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── Push: display notification ────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;

  let payload;
  try { payload = e.data.json(); }
  catch { payload = { title: 'Relationship diary', body: e.data.text() }; }

  const { title, body, icon = '/icons/icon-192.png', badge, url = '/' } = payload;

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag: 'diary-push',          // replace old notification of same type
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
      const match = clients.find(c => new URL(c.url).pathname === '/');
      if (match) return match.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});