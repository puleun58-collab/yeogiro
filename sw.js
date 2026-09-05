const APP_CACHE = 'yeogiro-app-v79';
const MAP_CACHE = 'yeogiro-map-v3';
const MAX_MAP_ENTRIES = 160;
const APP_SHELL = [
  '/',
  '/index.html',
  '/data-integrity.js?v=79',
  '/diagnostics.js?v=79',
  '/expense-logic.js?v=79',
  '/weather-logic.js?v=79',
  '/sync.js?v=79',
  '/sync-ui.js?v=79',
  '/travel-logic.js?v=79',
  '/notification-logic.js?v=79',
  '/preparation-logic.js?v=79',
  '/trip-recap-logic.js?v=79',
  '/pwa-update.js?v=79',
  '/offline.html',
  '/manifest.webmanifest',
  '/assets/icons/icon-192-v8.png',
  '/assets/icons/icon-512-v8.png',
  '/assets/icons/apple-touch-icon-v8.png',
  '/assets/icons/favicon-32-v8.png',
  '/assets/icons/browser-chrome.svg',
  '/assets/icons/browser-safari.svg',
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
