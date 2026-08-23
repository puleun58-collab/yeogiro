const APP_CACHE = 'yeogiro-app-v39';
const MAP_CACHE = 'yeogiro-map-v2';
const MAX_MAP_ENTRIES = 160;
const APP_SHELL = [
  '/',
  '/index.html',
  '/data-integrity.js?v=39',
  '/sync.js?v=39',
  '/sync-ui.js?v=39',
  '/travel-logic.js?v=39',
  '/offline.html',
  '/manifest.webmanifest',
  '/assets/icons/icon-192-v7.png',
  '/assets/icons/icon-512-v7.png',
  '/assets/icons/apple-touch-icon-v7.png',
  '/assets/icons/favicon-32-v7.png',
  '/assets/fonts/LINESeedKR-Regular.woff2',
  '/assets/fonts/LINESeedKR-Bold.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
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
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
