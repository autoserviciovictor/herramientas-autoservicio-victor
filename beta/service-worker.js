const CACHE_PREFIX = 'autoservicio-';
const CACHE_VERSION = 'autoservicio-v6.1.4-role-beta';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=614-editar-lista',
  './app.js?v=614-editar-lista',
  './config.js?v=614-editar-lista',
  './excel.js?v=614-editar-lista',
  './scanner.js?v=614-editar-lista',
  './reposicion.js?v=614-editar-lista',
  './ui.js?v=614-editar-lista',
  './release-channel.js?v=614-editar-lista',
  './pwa.js?v=614-editar-lista',
  './search.js?v=614-editar-lista',
  './admin.js?v=614-editar-lista',
  './auth.js?v=614-editar-lista',
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
