const CACHE_NAME = 'wandering-layer-v33';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './services/storage-service.js',
  './services/pins-service.js',
  './services/gps.js',
  './services/osm-service.js',
  './services/wiki-service.js',
  './services/route-service.js',
  './services/weather-service.js',
  './services/detour-budget.js',
  './services/voice.js',
  './services/journal-service.js',
  './services/context-service.js',
  './services/personas.js',
  './services/heartbeat.js',
  './services/wake-lock.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('Service worker cache.addAll notice:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First for fresh updates, falling back to Cache when offline (mountain driving)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, copy);
        });
      }
      return networkResponse;
    }).catch(() => {
      return caches.match(e.request);
    })
  );
});
