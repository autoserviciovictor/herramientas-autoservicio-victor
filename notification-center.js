import { API_BASE_URL } from "./config.js?v=1960-d21-cierre-etapa6-010926";
import { escapeHTML as esc } from "./shared/dom-utils.js?v=1960-d21-cierre-etapa6-010926";

const $ = (id) => document.getElementById(id);
const CACHE_KEY = "autoservicio_centro_notificaciones_v1220";
const CACHE_TTL = 30000;
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

let notificaciones = [];
let ultimaCarga = 0;
let cargaEnCurso = null;
let ultimoFoco = null;

const CATEGORIAS_KEY_BASE = "autoservicio_notificaciones_categorias_v2";
function claveCategoriasUsuario() {
  const usuario = window.AutoservicioAuth?.getUsuario?.();
  const clave = String(usuario?.usuario || usuario?.nombre || "anonimo").trim().toLowerCase();
  return `${CATEGORIAS_KEY_BASE}:${clave || "anonimo"}`;
}
function categoriaHabilitada(tipo = "") {
  let prefs = { vencimientos:true, tareas:true, bano:true };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(claveCategoriasUsuario()) || "{}") }; } catch {}
  const t = String(tipo || "").toLowerCase();
  if (t.includes("venc")) return prefs.vencimientos !== false;
  if (t.includes("tarea")) return prefs.tareas !== false;
  if (t.includes("bano") || t.includes("baño")) return prefs.bano !== false;
  return true;
}

function icono(tipo = "") {
  if (tipo.includes("tarea")) return "✓";
  if (tipo.includes("bano")) return "♨";
  if (tipo.includes("venc")) return "⚠";
  return "🔔";
}

function formatearFecha(valor = "") {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function usuarioActualClave() {
  return String(window.AutoservicioAuth?.getUsuario?.()?.usuario || "anon")
    .trim()
    .toLowerCase();
}

function cacheKeyUsuario() {
  return `${CACHE_KEY}:${usuarioActualClave()}`;
}

function urlInternaSegura(valor = "./") {
  const url = String(valor || "./").trim();
  if (url === "./") return "./";
  if (!url.startsWith("./?")) return "./";
  try {
    const resuelta = new URL(url, location.href);
    if (resuelta.origin !== location.origin) return "./";
    return `./${resuelta.search}`;
  } catch {
    return "./";
  }
}

function guardarCacheLocal() {
  try {
    sessionStorage.setItem(
      cacheKeyUsuario(),
      JSON.stringify({ fecha: Date.now(), notificaciones }),
    );
  } catch {}
}

function recuperarCacheLocal() {
  try {
    const dato = JSON.parse(sessionStorage.getItem(cacheKeyUsuario()) || "null");
    if (!dato || !Array.isArray(dato.notificaciones)) return false;
    notificaciones = dato.notificaciones;
    ultimaCarga = Number(dato.fecha) || 0;
    return true;
  } catch {
    return false;
  }
}

function render() {
  const lista = $("notificationCenterList");
  const badge = $("menuNotificacionesBadge");
  if (!lista) return;
  const visibles = notificaciones.filter((n) => categoriaHabilitada(n.tipo));
  const noLeidas = visibles.filter((n) => !n.leida).length;
  if (badge) {
    badge.textContent = String(noLeidas);
    badge.classList.toggle("oculto", !noLeidas);
  }
  const contador = $("notificationCenterCount");
  if (contador) {
    contador.textContent = `${visibles.length} notificaciones`;
    contador.setAttribute(
      "aria-label",
      `${visibles.length} notificaciones, ${noLeidas} sin leer`,
    );
  }
  if (!visibles.length) {
    lista.innerHTML = `<div class="notification-empty"><div aria-hidden="true">🔔</div><strong>No tenés notificaciones</strong><span>Cuando haya novedades aparecerán aquí.</span></div>`;
    return;
  }
  lista.innerHTML = visibles
    .map(
      (n) =>
        `<button type="button" class="notification-item ${n.leida ? "is-read" : "is-unread"}" data-id="${esc(n.id)}" data-url="${encodeURIComponent(urlInternaSegura(n.url))}"><span class="notification-item-icon" aria-hidden="true">${icono(String(n.tipo || ""))}</span><span class="notification-item-copy"><strong>${esc(n.titulo || "Notificación")}</strong><span>${esc(n.mensaje || "")}</span><small>${esc(formatearFecha(n.fecha))}</small></span>${n.leida ? "" : '<i role="img" aria-label="Nueva"></i>'}</button>`,
    )
    .join("");
}

async function cargar({ forzar = false } = {}) {
  const ahora = Date.now();
  if (!forzar && notificaciones.length && ahora - ultimaCarga < CACHE_TTL) {
    render();
    return notificaciones;
  }
  if (cargaEnCurso) return cargaEnCurso;
  cargaEnCurso = (async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/notificaciones/centro`, {
        cache: "no-store",
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        notificaciones = d.notificaciones || [];
        ultimaCarga = Date.now();
        guardarCacheLocal();
        render();
      }
    } catch {
      if (!notificaciones.length) recuperarCacheLocal();
      render();
    } finally {
      cargaEnCurso = null;
    }
    return notificaciones;
  })();
  return cargaEnCurso;
}

async function marcar(id) {
  const n = notificaciones.find((x) => x.id === id);
  if (n?.leida) return;
  if (n) n.leida = true;
  guardarCacheLocal();
  render();
  try {
    const r = await fetch(
      `${API_BASE_URL}/notificaciones/centro/${encodeURIComponent(id)}/leida`,
      { method: "PATCH" },
    );
    if (!r.ok) throw new Error();
  } catch {
    if (n) n.leida = false;
    guardarCacheLocal();
    render();
  }
}

function panelAbierto() {
  return !$("notificationCenterOverlay")?.classList.contains("oculto");
}

function elementosFocoPanel() {
  return [...($("notificationCenterOverlay")?.querySelectorAll(FOCUSABLE_SELECTOR) || [])].filter(
    (elemento) => elemento.getClientRects().length > 0,
  );
}

function manejarTeclado(evento) {
  if (!panelAbierto()) return;
  if (evento.key === "Escape") {
    evento.preventDefault();
    cerrar();
    return;
  }
  if (evento.key !== "Tab") return;
  const focos = elementosFocoPanel();
  if (!focos.length) return;
  const primero = focos[0];
  const ultimo = focos[focos.length - 1];
  if (evento.shiftKey && document.activeElement === primero) {
    evento.preventDefault();
    ultimo.focus();
  } else if (!evento.shiftKey && document.activeElement === ultimo) {
    evento.preventDefault();
    primero.focus();
  }
}

function abrir() {
  $("userDropdown")?.classList.add("oculto");
  const overlay = $("notificationCenterOverlay");
  if (!overlay || !overlay.classList.contains("oculto")) return;
  ultimoFoco = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.classList.remove("oculto");
  overlay.setAttribute("aria-hidden", "false");
  $("proHeaderNotifications")?.setAttribute("aria-expanded", "true");
  $("btnMenuNotificaciones")?.setAttribute("aria-expanded", "true");
  document.body.classList.add("notification-center-open");
  document.addEventListener("keydown", manejarTeclado);
  requestAnimationFrame(() => $("btnCerrarNotificationCenter")?.focus());
  void cargar();
}

function cerrar() {
  const overlay = $("notificationCenterOverlay");
  if (!overlay || overlay.classList.contains("oculto")) return;
  overlay.classList.add("oculto");
  overlay.setAttribute("aria-hidden", "true");
  $("proHeaderNotifications")?.setAttribute("aria-expanded", "false");
  $("btnMenuNotificaciones")?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("notification-center-open");
  document.removeEventListener("keydown", manejarTeclado);
  const foco = ultimoFoco;
  ultimoFoco = null;
  requestAnimationFrame(() => foco?.isConnected && foco.focus());
}

document.addEventListener("DOMContentLoaded", () => {
  if (recuperarCacheLocal()) render();
  $("btnMenuNotificaciones")?.addEventListener("click", abrir);
  $("btnCerrarNotificationCenter")?.addEventListener("click", cerrar);
  $("notificationCenterOverlay")?.addEventListener("click", (e) => {
    if (e.target === $("notificationCenterOverlay")) cerrar();
  });
  $("btnMarcarTodasLeidas")?.addEventListener("click", async () => {
    const anteriores = notificaciones.map((n) => n.leida);
    notificaciones.forEach((n) => (n.leida = true));
    guardarCacheLocal();
    render();
    try {
      const r = await fetch(`${API_BASE_URL}/notificaciones/centro-leidas`, {
        method: "PATCH",
      });
      if (!r.ok) throw new Error();
    } catch {
      notificaciones.forEach((n, i) => (n.leida = anteriores[i]));
      guardarCacheLocal();
      render();
    }
  });
  $("notificationCenterList")?.addEventListener("click", async (e) => {
    const b = e.target.closest(".notification-item");
    if (!b) return;
    await marcar(b.dataset.id);
    const url = urlInternaSegura(decodeURIComponent(b.dataset.url || "./"));
    cerrar();
    if (url !== "./") location.href = url;
  });
});

window.addEventListener("autoservicio:sesion", (event) => {
  notificaciones = [];
  ultimaCarga = 0;
  cargaEnCurso = null;
  if (event.detail?.usuario) {
    recuperarCacheLocal();
    render();
    void cargar({ forzar: true });
  } else {
    cerrar();
    render();
  }
});
window.addEventListener("autoservicio:notificacion-creada", () =>
  cargar({ forzar: true }),
);

window.addEventListener("autoservicio:notificaciones-preferencias", render);
