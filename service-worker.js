// NOTIFICACIONES_VISUALIZACION_SW_V7_010926: confirma recepción real del Push y usa fallback mínimo de showNotification.
// NOTIFICACIONES_REINTENTOS_RUNTIME_V4_010926: corrige recursión del registro Push y fuerza refresco del módulo.
// NOTIFICACIONES_PROMPT_NATIVO_V3_010926: fuerza actualización para el flujo nativo de permisos.
// NOTIFICACIONES_PERMISO_V2_010926: refresco explícito del módulo notifications.js.
// NOTIFICACIONES_PERMISO_INGRESO_010926: fuerza reinstalación del SW para refrescar notifications.js.
// NOTIFICACIONES_ROBUSTEZ_010926: fuerza actualización del SW y refresco de assets del app shell.
const CACHE_PREFIX = "autoservicio-v";
const CACHE_VERSION = "autoservicio-v1960-d21-cierre-etapa6-010926";
const OFFLINE_DOCUMENT = "./index.html";
const APP_SHELL = [
  "./",
  "./index.html",
  "./design-tokens.css?v=1960-d21-cierre-etapa6-010926",
  "./style.css?v=1960-d21-cierre-etapa6-010926",
  "./horarios-redesign.css?v=1960-d21-cierre-etapa6-010926",
  "./tareas-redesign.css?v=1960-d21-cierre-etapa6-010926",
  "./admin-official.css?v=1960-d21-cierre-etapa6-010926",
  "./login-redesign.css?v=1960-d21-cierre-etapa6-010926",
  "./settings-user.css?v=1960-d21-cierre-etapa6-010926",
  "./ui-unification.css?v=1960-d21-cierre-etapa6-010926",
  "./design-components.css?v=1960-d21-cierre-etapa6-010926",
  "./app-shell.css?v=1960-d21-cierre-etapa6-010926",
  "./desktop-layout.css?v=1960-d21-cierre-etapa6-010926",
  "./app.js?v=1960-d21-cierre-etapa6-010926",
  "./config.js?v=1960-d21-cierre-etapa6-010926",
  "./excel.js?v=1960-d21-cierre-etapa6-010926",
  "./scanner.js?v=1960-d21-cierre-etapa6-010926",
  "./etiquetas.js?v=1960-d21-cierre-etapa6-010926",
  "./product-loader.js?v=1960-d21-cierre-etapa6-010926",
  "./reposicion.js?v=1960-d21-cierre-etapa6-010926",
  "./ui.js?v=1960-d21-cierre-etapa6-010926",
  "./shared/dom-utils.js?v=1960-d21-cierre-etapa6-010926",
  "./modules/tareas/task-view.js?v=1960-d21-cierre-etapa6-010926",
  "./modules/horarios/schedule-format.js?v=1960-d21-cierre-etapa6-010926",
  "./pwa.js?v=1960-d21-cierre-etapa6-010926",
  "./dialog.js?v=1960-d21-cierre-etapa6-010926",
  "./notification-center.js?v=1960-d21-cierre-etapa6-010926",
  "./pro-ui.js?v=1960-d21-cierre-etapa6-010926",
  "./search.js?v=1960-d21-cierre-etapa6-010926",
  "./horarios-config.js?v=1960-d21-cierre-etapa6-010926",
  "./admin.js?v=1960-d21-cierre-etapa6-010926",
  "./auth.js?v=1960-d21-cierre-etapa6-010926",
  "./notifications.js?v=1960-d21-cierre-etapa6-010926",
  "./prices.js?v=1960-d21-cierre-etapa6-010926",
  "./horarios.js?v=1960-d21-cierre-etapa6-010926",
  "./api-cache.js?v=1960-d21-cierre-etapa6-010926",
  "./tareas.js?v=1960-d21-cierre-etapa6-010926",
  "./manifest.webmanifest",
  "./version.json",
  "./icons/icon-96.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/notification-badge-96.png",
  "./icons/brand-logo-full.png",
  "./icons/brand-logo-desktop-light.png",
  "./icons/brand-logo-desktop-dark.png",
  "./icons/favicon.png",
];

async function guardarAppShell() {
  const cache = await caches.open(CACHE_VERSION);
  // El service worker solo se instala si el App Shell completo quedó
  // disponible. Así una versión parcial nunca reemplaza una versión sana.
  await Promise.all(
    APP_SHELL.map(async (recurso) => {
      const respuesta = await fetch(recurso, { cache: "reload" });
      if (!respuesta.ok) throw new Error(`${recurso}: ${respuesta.status}`);
      await cache.put(recurso, respuesta);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    guardarAppShell(),
  );
  // No se usa skipWaiting aquí: la versión nueva queda preparada y no
  // reemplaza archivos mientras la aplicación está abierta.
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function conTiempoLimite(promesa, milisegundos) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Tiempo de red agotado")),
      milisegundos,
    );
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
    return (
      (await cache.match(OFFLINE_DOCUMENT)) ||
      (await caches.match("./")) ||
      Response.error()
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(navegacionSegura(request));
    return;
  }

  if (url.origin === self.location.origin) {
    // Red primero para evitar que una actualización deje ejecutándose JS/CSS
    // de una versión anterior. Conservamos el cache como respaldo offline.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        try {
          const esEtiquetas = url.pathname.endsWith("/etiquetas.js");
          const respuesta = await fetch(request, esEtiquetas ? { cache: "reload" } : undefined);
          if (respuesta?.ok) await cache.put(request, respuesta.clone());
          return respuesta;
        } catch {
          return (await cache.match(request)) || Response.error();
        }
      })(),
    );
    return;
  }

  // Recursos externos (por ejemplo ZXing): red primero y último respaldo en caché.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        const respuesta = await fetch(request);
        if (respuesta?.ok) await cache.put(request, respuesta.clone());
        return respuesta;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        data = event.data ? event.data.json() : {};
      } catch {
        data = { title: "Vencimientos", body: event.data?.text() || "" };
      }

      const receipt = data?.pushReceipt || {};
      const reportar = async (fase, error = null) => {
        if (!receipt?.url || !receipt?.token) return;
        try {
          await fetch(receipt.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: receipt.token,
              fase,
              errorNombre: error?.name || "",
              errorMensaje: String(error?.message || "").slice(0, 180),
            }),
          });
        } catch {}
      };

      await reportar("push-recibido");

      const title = data.title || "Autoservicio Victor";
      const options = {
        body: data.body || "Tenés una nueva notificación.",
        icon: "./icons/icon-192.png",
        badge: "./icons/notification-badge-96.png",
        tag: data.tag || `autoservicio-${Date.now()}`,
        data: data.data || { url: "./" },
      };

      try {
        await self.registration.showNotification(title, options);
        await reportar("notificacion-mostrada");
      } catch (error) {
        await reportar("showNotification-error", error);
        try {
          // Fallback mínimo para navegadores/Android que rechazan alguna opción visual.
          await self.registration.showNotification(title, {
            body: options.body,
            tag: options.tag,
            data: options.data,
          });
          await reportar("notificacion-mostrada-fallback");
        } catch (fallbackError) {
          await reportar("showNotification-fallback-error", fallbackError);
          throw fallbackError;
        }
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let destino = "./";
  try {
    const base = new URL(self.registration.scope);
    const candidato = new URL(event.notification.data?.url || "./", base);
    if (
      candidato.origin === base.origin &&
      candidato.pathname === base.pathname
    )
      destino = `./${candidato.search}`;
  } catch {}
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((ventanas) => {
        for (const ventana of ventanas) {
          if ("focus" in ventana) {
            ventana.navigate(destino).catch(() => {});
            return ventana.focus();
          }
        }
        return clients.openWindow ? clients.openWindow(destino) : undefined;
      }),
  );
});

