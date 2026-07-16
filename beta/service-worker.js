const CACHE_PREFIX = 'autoservicio-';
const CACHE_VERSION = 'autoservicio-v6.1.3-role-beta';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=613-doble-lista',
  './app.js?v=613-doble-lista',
  './config.js?v=613-doble-lista',
  './excel.js?v=613-doble-lista',
  './scanner.js?v=613-doble-lista',
  './reposicion.js?v=613-doble-lista',
  './ui.js?v=613-doble-lista',
  './release-channel.js?v=613-doble-lista',
  './pwa.js?v=613-doble-lista',
  './search.js?v=613-doble-lista',
  './admin.js?v=613-doble-lista',
  './auth.js?v=613-doble-lista',
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
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION).map(key => caches.delete(key))))
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
