const CACHE_PREFIX = 'autoservicio-';
const CACHE_VERSION = 'autoservicio-beta-71-entrega521-importacion-codigos';
const OFFLINE_DOCUMENT = './index.html';
const APP_SHELL = [
  './',
  './index.html',
  './xlsx.full.min.js',
  './style.css?v=71-entrega521-importacion-codigos',
  './app.js?v=71-entrega521-importacion-codigos',
  './config.js?v=71-entrega521-importacion-codigos',
  './excel.js?v=71-entrega521-importacion-codigos',
  './scanner.js?v=71-entrega521-importacion-codigos',
  './reposicion.js?v=71-entrega521-importacion-codigos',
  './ui.js?v=71-entrega521-importacion-codigos',
  './release-channel.js?v=71-entrega521-importacion-codigos',
  './pwa.js?v=71-entrega521-importacion-codigos',
  './search.js?v=71-entrega521-importacion-codigos',
  './admin.js?v=71-entrega521-importacion-codigos',
  './auth.js?v=71-entrega521-importacion-codigos',
  './notifications.js?v=71-entrega521-importacion-codigos',
  './prices.js?v=71-entrega521-importacion-codigos',
  './api-cache.js?v=71-entrega521-importacion-codigos',
  './manifest.webmanifest',
  './icons/icon-96.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/notification-badge-96.png',
  './icons/brand-logo-full.png',
  './icons/favicon.png'
];

async function guardarAppShell() {
  const cache = await caches.open(CACHE_VERSION);
  const resultados = await Promise.allSettled(APP_SHELL.map(async recurso => {
    const respuesta = await fetch(recurso, { cache: 'reload' });
    if (!respuesta.ok) throw new Error(`${recurso}: ${respuesta.status}`);
    await cache.put(recurso, respuesta);
  }));
  const correctos = resultados.filter(resultado => resultado.status === 'fulfilled').length;
  if (!correctos) throw new Error('No se pudo guardar ningún recurso de la aplicación.');
}

self.addEventListener('install', event => {
  event.waitUntil(guardarAppShell());
  // No se usa skipWaiting aquí: la versión nueva queda preparada y no
  // reemplaza archivos mientras la aplicación está abierta.
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function conTiempoLimite(promesa, milisegundos) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Tiempo de red agotado')), milisegundos);
  });
  try {
    return await Promise.race([promesa, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function navegacionSegura(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const respuesta = await conTiempoLimite(fetch(request), 4500);
    if (respuesta?.ok) await cache.put(OFFLINE_DOCUMENT, respuesta.clone());
    return respuesta;
  } catch {
    return (await cache.match(OFFLINE_DOCUMENT)) || (await caches.match('./')) || Response.error();
  }
}

async function cachePrimero(request) {
  const cache = await caches.open(CACHE_VERSION);
  const guardado = await cache.match(request);
  if (guardado) return guardado;
  const respuesta = await fetch(request);
  if (respuesta?.ok) await cache.put(request, respuesta.clone());
  return respuesta;
}

async function actualizarEnSegundoPlano(request, event) {
  const cache = await caches.open(CACHE_VERSION);
  const guardado = await cache.match(request);
  const actualizacion = fetch(request).then(async respuesta => {
    if (respuesta?.ok) await cache.put(request, respuesta.clone());
    return respuesta;
  });
  if (guardado) {
    event.waitUntil(actualizacion.catch(() => undefined));
    return guardado;
  }
  return actualizacion;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(navegacionSegura(request));
    return;
  }

  if (url.origin === self.location.origin) {
    const esArchivoVersionado = url.searchParams.has('v');
    const esImagen = request.destination === 'image';
    if (esArchivoVersionado || esImagen) {
      event.respondWith(cachePrimero(request));
    } else {
      event.respondWith(actualizarEnSegundoPlano(request, event));
    }
    return;
  }

  // Recursos externos (por ejemplo ZXing): red primero y último respaldo en caché.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    try {
      const respuesta = await fetch(request);
      if (respuesta?.ok) await cache.put(request, respuesta.clone());
      return respuesta;
    } catch {
      return (await cache.match(request)) || Response.error();
    }
  })());
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Vencimientos', body: event.data?.text() || '' }; }
  const title = data.title || 'Vencimientos';
  const options = {
    body: data.body || 'Tenés una alerta de vencimiento.',
    icon: './icons/icon-192.png',
    badge: './icons/notification-badge-96.png',
    tag: data.tag || `vencimiento-${Date.now()}`,
    renotify: false,
    data: data.data || { url: './' },
    vibrate: [150, 80, 150]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destino = event.notification.data?.url || './';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ventanas => {
    for (const ventana of ventanas) {
      if ('focus' in ventana) {
        ventana.navigate(destino).catch(() => {});
        return ventana.focus();
      }
    }
    return clients.openWindow ? clients.openWindow(destino) : undefined;
  }));
});
