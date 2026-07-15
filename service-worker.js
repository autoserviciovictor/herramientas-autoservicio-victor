const CACHE_VERSION = 'autoservicio-victor-pwa-5.3.3';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=533-tilde-reposicion',
  './app.js?v=533-tilde-reposicion',
  './config.js?v=533-tilde-reposicion',
  './excel.js?v=533-tilde-reposicion',
  './scanner.js?v=533-tilde-reposicion',
  './reposicion.js?v=533-tilde-reposicion',
  './ui.js?v=533-tilde-reposicion',
  './pwa.js?v=533-tilde-reposicion',
  './search.js?v=533-tilde-reposicion',
  './admin.js?v=533-tilde-reposicion',
  './auth.js?v=533-tilde-reposicion',
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
