const CACHE_NAME = 'diary-app-v3';
const urlsToCache = [
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/supabase.js'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Принудительно заставляем новый SW обновиться
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Захватываем контроль над всеми открытыми вкладками
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    // Network-first strategy to ensure users always get the latest code
    fetch(event.request).then(response => {
      return caches.open(CACHE_NAME).then(cache => {
        cache.put(event.request, response.clone());
        return response;
      });
    }).catch(() => {
      return caches.match(event.request);
    })
  );
});
