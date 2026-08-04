const CACHE_PREFIX = 'autoservicio-v12311';
const CACHE_VERSION = 'autoservicio-v12311';
const OFFLINE_DOCUMENT = './index.html';
const APP_SHELL = [
  './',
  './index.html',
  './xlsx.full.min.js',
  './design-tokens.css?v=12310',
  './style.css?v=12310',
  './design-components.css?v=12310',
  './app-shell.css?v=12310',
  './app.js?v=12310',
  './config.js?v=12310',
  './excel.js?v=12310',
  './scanner.js?v=12310',
  './reposicion.js?v=12310',
  './ui.js?v=12310',
  './module-registry.js?v=12310',
  './shared/dom-utils.js?v=12310',
  './modules/tareas/task-view.js?v=12310',
  './modules/horarios/schedule-format.js?v=12310',
  './pwa.js?v=12310',
  './search.js?v=12310',
  './horarios-config.js?v=12310',
  './admin.js?v=12310',
  './auth.js?v=12310',
  './notifications.js?v=12310',
  './prices.js?v=12310',
  './horarios.js?v=12310',
  './api-cache.js?v=12310',
  './tareas.js?v=12310',
  './manifest.webmanifest',
  './version.json',
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
    event.respondWith(actualizarEnSegundoPlano(request, event));
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
