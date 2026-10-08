import { API_BASE_URL } from "./config.js?v=1960-d21-cierre-etapa6-010926";

const MEMORIA = new Map();
const EN_CURSO = new Map();
const PREFIJO_LEGADO = "autoservicio_api_cache_v2:";
const CACHE_STORAGE = "autoservicio-api-datos-v1";
const TTL_CATALOGO = 5 * 60 * 1000;

function url(ruta) {
  return `${String(API_BASE_URL || "").replace(/\/$/, "")}${ruta}`;
}
function claveLegada(ruta) {
  return `${PREFIJO_LEGADO}${ruta}`;
}
function cacheRequest(ruta) {
  const base = typeof location !== "undefined" ? location.origin : "https://autoservicio.local";
  return new Request(`${base}/__autoservicio_cache_datos__?ruta=${encodeURIComponent(ruta)}`);
}
function cacheStorageDisponible() {
  return typeof caches !== "undefined" && typeof caches.open === "function";
}
function leerLocalLegado(ruta) {
  try {
    const item = JSON.parse(localStorage.getItem(claveLegada(ruta)) || "null");
    return item && item.data ? item : null;
  } catch {
    return null;
  }
}
function borrarLocalLegado(ruta) {
  try { localStorage.removeItem(claveLegada(ruta)); } catch {}
}
async function leerPersistente(ruta) {
  if (cacheStorageDisponible()) {
    try {
      const cache = await caches.open(CACHE_STORAGE);
      const respuesta = await cache.match(cacheRequest(ruta));
      if (respuesta) {
        const data = await respuesta.json();
        const item = {
          fecha: Number(respuesta.headers.get("X-Cache-Fecha")) || 0,
          etag: respuesta.headers.get("X-Cache-ETag") || "",
          data,
        };
        if (item.data) return item;
      }
    } catch {}
  }

  // Migración segura: las versiones anteriores guardaban este catálogo en
  // localStorage. Solo se elimina esa copia después de haberla trasladado con éxito.
  const legado = leerLocalLegado(ruta);
  if (!legado) return null;
  if (cacheStorageDisponible()) {
    const migrado = await guardarPersistente(ruta, legado.data, legado.etag || "", legado.fecha || Date.now());
    if (migrado) borrarLocalLegado(ruta);
  }
  return legado;
}
async function guardarPersistente(ruta, data, etag = "", fecha = Date.now()) {
  const item = { fecha, etag, data };
  MEMORIA.set(ruta, item);

  // Los catálogos pueden ser grandes. Cache Storage tiene una cuota apropiada
  // para datos cacheables y evita consumir el pequeño cupo de localStorage.
  if (cacheStorageDisponible()) {
    try {
      const cache = await caches.open(CACHE_STORAGE);
      await cache.put(
        cacheRequest(ruta),
        new Response(JSON.stringify(data), {
          headers: {
            "Content-Type": "application/json",
            "X-Cache-Fecha": String(fecha),
            "X-Cache-ETag": String(etag || ""),
          },
        }),
      );
      borrarLocalLegado(ruta);
      return true;
    } catch {}
  }

  // Compatibilidad para navegadores sin Cache Storage. No se borra ninguna
  // copia previa si este respaldo tampoco puede escribirse.
  try {
    localStorage.setItem(claveLegada(ruta), JSON.stringify(item));
    return true;
  } catch {
    return false;
  }
}
async function obtenerGuardado(ruta) {
  if (MEMORIA.has(ruta)) return MEMORIA.get(ruta);
  const item = await leerPersistente(ruta);
  if (item) MEMORIA.set(ruta, item);
  return item;
}

export async function obtenerJsonCacheado(
  ruta,
  { ttl = TTL_CATALOGO, forzar = false } = {},
) {
  const guardado = await obtenerGuardado(ruta);
  const vigente = guardado && Date.now() - Number(guardado.fecha || 0) < ttl;
  if (!forzar && vigente) return { ...guardado.data, cache: true };
  if (EN_CURSO.has(ruta)) return EN_CURSO.get(ruta);

  const promesa = (async () => {
    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), 15000);
    try {
      const headers = {};
      if (guardado?.etag) headers["If-None-Match"] = guardado.etag;
      const respuesta = await fetch(url(ruta), {
        cache: "no-store",
        headers,
        signal: controlador.signal,
      });
      if (respuesta.status === 304 && guardado) {
        await guardarPersistente(ruta, guardado.data, guardado.etag);
        return { ...guardado.data, cache: true, revalidado: true };
      }
      const data = await respuesta.json().catch(() => null);
      if (!respuesta.ok || !data?.ok)
        throw new Error(data?.mensaje || "No se pudieron cargar los datos");
      await guardarPersistente(ruta, data, respuesta.headers.get("ETag") || "");
      return data;
    } catch (error) {
      if (guardado) return { ...guardado.data, offline: true, cache: true };
      if (error?.name === "AbortError")
        throw new Error("El servidor tardó demasiado en responder");
      throw error instanceof Error
        ? error
        : new Error("No se pudo conectar con el servidor");
    } finally {
      clearTimeout(timer);
      EN_CURSO.delete(ruta);
    }
  })();
  EN_CURSO.set(ruta, promesa);
  return promesa;
}

export function precargarCatalogo() {
  if (!navigator.onLine) return Promise.resolve(null);
  return obtenerJsonCacheado("/productos-maestro", { ttl: TTL_CATALOGO }).catch(
    () => null,
  );
}
