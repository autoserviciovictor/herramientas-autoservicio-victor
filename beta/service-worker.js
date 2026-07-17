const CACHE_PREFIX = 'autoservicio-';
const CACHE_VERSION = 'autoservicio-v6.1.10-consolidada';
const APP_SHELL = [
  './',
  './index.html',
  './xlsx.full.min.js',
  './style.css?v=6110-consolidada',
  './app.js?v=6110-consolidada',
  './config.js?v=6110-consolidada',
  './excel.js?v=6110-consolidada',
  './scanner.js?v=6110-consolidada',
  './reposicion.js?v=6110-consolidada',
  './ui.js?v=6110-consolidada',
  './release-channel.js?v=6110-consolidada',
  './pwa.js?v=6110-consolidada',
  './search.js?v=6110-consolidada',
  './admin.js?v=6110-consolidada',
  './auth.js?v=6110-consolidada',
  './notifications.js?v=6110-consolidada',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/notification-badge-96.png',
  './icons/brand-logo-full.png',
  './icons/favicon.png'
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


self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Vencimientos', body: event.data?.text() || '' }; }
  const title = data.title || 'Vencimientos';
  const options = {
    body: data.body || 'Tenés una alerta de vencimiento.',
    badge: './icons/notification-badge-96.png',
    tag: data.tag || `vencimiento-${Date.now()}`, renotify: false,
    data: data.data || { url: './' }, vibrate: [150, 80, 150]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destino = event.notification.data?.url || './';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ventanas => {
    for (const ventana of ventanas) { if ('focus' in ventana) { ventana.navigate(destino).catch(() => {}); return ventana.focus(); } }
    return clients.openWindow ? clients.openWindow(destino) : undefined;
  }));
});
