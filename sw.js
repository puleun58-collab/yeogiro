const APP_CACHE = 'yeogiro-app-v83';
const MAP_CACHE = 'yeogiro-map-v3';
const MAX_MAP_ENTRIES = 160;
const APP_SHELL = [
  '/',
  '/index.html',
  '/data-integrity.js?v=83',
  '/diagnostics.js?v=83',
  '/expense-logic.js?v=83',
  '/weather-logic.js?v=83',
  '/sync.js?v=83',
  '/sync-ui.js?v=83',
  '/travel-logic.js?v=83',
  '/notification-logic.js?v=83',
  '/preparation-logic.js?v=83',
  '/trip-recap-logic.js?v=83',
  '/pwa-update.js?v=83',
  '/offline.html',
  '/manifest.webmanifest',
  '/assets/icons/icon-192-v8.png',
  '/assets/icons/icon-512-v8.png',
  '/assets/icons/apple-touch-icon-v8.png',
  '/assets/icons/favicon-32-v8.png',
  '/assets/icons/browser-chrome.svg',
  '/assets/icons/browser-safari.svg',
  '/assets/icons/settings/data-storage.svg',
  '/assets/icons/settings/profile.svg',
  '/assets/icons/settings/sharing.svg',
  '/assets/icons/settings/history-recovery.svg',
  '/assets/icons/settings/notifications.svg',
  '/assets/icons/settings/travel-prep.svg',
  '/assets/icons/settings/calendar.svg',
  '/assets/icons/settings/json-export.svg',
  '/assets/icons/settings/json-import.svg',
  '/assets/icons/settings/guide.svg',
  '/assets/icons/settings/diagnostics.svg',
  '/assets/icons/settings/reset.svg',
  '/assets/icons/settings/install.svg',
  '/assets/icons/settings/device-link.svg',
  '/assets/icons/storage-status/storage-schedule-sync.png',
  '/assets/icons/storage-status/storage-original-file.png',
  '/assets/icons/storage-status/storage-capacity.png',
  '/assets/icons/storage-status/storage-file-settings.png',
  '/assets/icons/storage-status/storage-recovery-key.png',
  '/assets/icons/storage-status/storage-json-backup.png',
  '/assets/icons/diagnostics/diagnostics-version.png',
  '/assets/icons/diagnostics/diagnostics-network.png',
  '/assets/icons/diagnostics/diagnostics-sync.png',
  '/assets/icons/diagnostics/diagnostics-current-trip.png',
  '/assets/icons/diagnostics/diagnostics-service-worker.png',
  '/assets/icons/diagnostics/diagnostics-device-storage.png',
  '/assets/icons/diagnostics/diagnostics-api-d1.png',
  '/assets/icons/diagnostics/diagnostics-error.png',
  '/assets/fonts/LINESeedKR-Regular.woff2',
  '/assets/fonts/LINESeedKR-Bold.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => ![APP_CACHE, MAP_CACHE].includes(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      if (request.mode === 'navigate') {
        cache.put('/index.html', response.clone());
        cache.put('/', response.clone());
      }
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return (await cache.match('/index.html')) || cache.match('/offline.html');
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    await cache.put(request, response.clone());
    if (cacheName === MAP_CACHE) {
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_MAP_ENTRIES)).map(key => cache.delete(key)));
    }
  }
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/map-tile/')) {
    event.respondWith(cacheFirst(request, MAP_CACHE));
    return;
  }
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.hostname === 'tile.openstreetmap.org') {
    event.respondWith(cacheFirst(request, MAP_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    const appCode = /\.(?:js|css)$/.test(url.pathname);
    event.respondWith(appCode ? networkFirst(request) : cacheFirst(request, APP_CACHE));
  }
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.action === 'directions'
    ? event.notification.data?.directionsUrl
    : event.notification.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    const app = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (app && !/^https?:\/\//.test(url)) {
      await app.navigate(url);
      return app.focus();
    }
    return clients.openWindow(url);
  }));
});
