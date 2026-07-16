const CACHE_PREFIX = 'autoservicio-';
const CACHE_VERSION = 'autoservicio-v6.1.2-role-beta';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=612-responsive-dia',
  './app.js?v=612-responsive-dia',
  './config.js?v=612-responsive-dia',
  './excel.js?v=612-responsive-dia',
  './scanner.js?v=612-responsive-dia',
  './reposicion.js?v=612-responsive-dia',
  './ui.js?v=612-responsive-dia',
  './release-channel.js?v=612-responsive-dia',
  './pwa.js?v=612-responsive-dia',
  './search.js?v=612-responsive-dia',
  './admin.js?v=612-responsive-dia',
  './auth.js?v=612-responsive-dia',
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
