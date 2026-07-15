const CACHE_VERSION = 'autoservicio-victor-pwa-5.2.2';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=522-admin',
  './app.js?v=522-admin',
  './config.js?v=522-admin',
  './excel.js?v=522-admin',
  './scanner.js?v=522-admin',
  './reposicion.js?v=522-admin',
  './ui.js?v=522-admin',
  './pwa.js?v=522-admin',
  './search.js?v=522-admin',
  './admin.js?v=522-admin',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
        }
        return response;
      }))
    );
    return;
  }

  event.respondWith(
    fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request))
  );
});
