/* YumEra Eternal Universe — service worker (PWA + Web Push) */
const VERSION = 'yumera-v4-1';
const SHELL = `${VERSION}-shell`;
const ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/assets/yumera-signature-tone.wav',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match('/').then((hit) => hit || new Response('YumEra is offline', { status: 503 })))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => undefined);
        }
        return res;
      });
    })
  );
});

/* --------------------------------- web push -------------------------------- */

self.addEventListener('push', (event) => {
  let data = { title: 'YumEra', body: 'Your universe has something to tell you.', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'yumera',
    renotify: false,
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Open YumEra' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  if (data.sound === 'silent') {
    options.silent = true;
  } else if (data.sound === 'signature') {
    // The OS decides the real alert sound. Some platforms honour this file;
    // iOS and most desktop browsers use the system sound instead.
    options.sound = '/assets/yumera-signature-tone.wav';
  }

  event.waitUntil(self.registration.showNotification(data.title || 'YumEra', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) client.postMessage({ type: 'yumera:resubscribe' });
    })()
  );
});
