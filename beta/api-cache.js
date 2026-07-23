import { API_BASE_URL } from "./config.js?v=71-entrega4-rendimiento-sync";

const MEMORIA = new Map();
const EN_CURSO = new Map();
const PREFIJO = "autoservicio_api_cache_v2:";
const TTL_CATALOGO = 5 * 60 * 1000;

function url(ruta) { return `${String(API_BASE_URL || "").replace(/\/$/, "")}${ruta}`; }
function clave(ruta) { return `${PREFIJO}${ruta}`; }
function leerLocal(ruta) {
  try {
    const item = JSON.parse(localStorage.getItem(clave(ruta)) || "null");
    return item && item.data ? item : null;
  } catch { return null; }
}
function guardarLocal(ruta, data, etag = "") {
  const item = { fecha: Date.now(), etag, data };
  MEMORIA.set(ruta, item);
  try { localStorage.setItem(clave(ruta), JSON.stringify(item)); } catch {}
  return item;
}
function obtenerGuardado(ruta) { return MEMORIA.get(ruta) || leerLocal(ruta); }

export function invalidarCacheApi(ruta = "") {
  for (const key of [...MEMORIA.keys()]) if (!ruta || key === ruta) MEMORIA.delete(key);
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIJO) && (!ruta || key === clave(ruta))) localStorage.removeItem(key);
    }
  } catch {}
}

export async function obtenerJsonCacheado(ruta, { ttl = TTL_CATALOGO, forzar = false } = {}) {
  const guardado = obtenerGuardado(ruta);
  const vigente = guardado && Date.now() - Number(guardado.fecha || 0) < ttl;
  if (!forzar && vigente) return { ...guardado.data, cache: true };
  if (EN_CURSO.has(ruta)) return EN_CURSO.get(ruta);

  const promesa = (async () => {
    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), 15000);
    try {
      const headers = {};
      if (guardado?.etag) headers["If-None-Match"] = guardado.etag;
      const respuesta = await fetch(url(ruta), { cache: "no-store", headers, signal: controlador.signal });
      if (respuesta.status === 304 && guardado) {
        guardarLocal(ruta, guardado.data, guardado.etag);
        return { ...guardado.data, cache: true, revalidado: true };
      }
      const data = await respuesta.json().catch(() => null);
      if (!respuesta.ok || !data?.ok) throw new Error(data?.mensaje || "No se pudieron cargar los datos");
      guardarLocal(ruta, data, respuesta.headers.get("ETag") || "");
      return data;
    } catch (error) {
      if (guardado) return { ...guardado.data, offline: true, cache: true };
      if (error?.name === "AbortError") throw new Error("El servidor tardó demasiado en responder");
      throw error instanceof Error ? error : new Error("No se pudo conectar con el servidor");
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
  return obtenerJsonCacheado("/productos-maestro", { ttl: TTL_CATALOGO }).catch(() => null);
}
