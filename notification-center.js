import { API_BASE_URL } from "./config.js?v=1211";

const $ = id => document.getElementById(id);
const CACHE_KEY = "autoservicio_centro_notificaciones_v1211";
const CACHE_TTL = 30000;
let notificaciones = [];
let ultimaCarga = 0;
let cargaEnCurso = null;

function icono(tipo = "") {
  if (tipo.includes("tarea")) return "✓";
  if (tipo.includes("bano")) return "♨";
  if (tipo.includes("venc")) return "⚠";
  return "🔔";
}

function formatearFecha(valor = "") {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor;
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

function guardarCacheLocal() {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ fecha: Date.now(), notificaciones })); } catch {}
}

function recuperarCacheLocal() {
  try {
    const dato = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    if (!dato || !Array.isArray(dato.notificaciones)) return false;
    notificaciones = dato.notificaciones;
    ultimaCarga = Number(dato.fecha) || 0;
    return true;
  } catch { return false; }
}

function render() {
  const lista = $("notificationCenterList");
  const badge = $("menuNotificacionesBadge");
  if (!lista) return;
  const noLeidas = notificaciones.filter(n => !n.leida).length;
  if (badge) {
    badge.textContent = String(noLeidas);
    badge.classList.toggle("oculto", !noLeidas);
  }
  const contador = $("notificationCenterCount");
  if (contador) contador.textContent = `${notificaciones.length} notificaciones`;
  if (!notificaciones.length) {
    lista.innerHTML = `<div class="notification-empty"><div>🔔</div><strong>No tenés notificaciones</strong><span>Cuando haya novedades aparecerán aquí.</span></div>`;
    return;
  }
  lista.innerHTML = notificaciones.map(n => `<button type="button" class="notification-item ${n.leida ? "is-read" : "is-unread"}" data-id="${n.id}" data-url="${encodeURIComponent(n.url || "./")}"><span class="notification-item-icon">${icono(n.tipo)}</span><span class="notification-item-copy"><strong>${n.titulo || "Notificación"}</strong><span>${n.mensaje || ""}</span><small>${formatearFecha(n.fecha)}</small></span>${n.leida ? "" : '<i aria-label="Nueva"></i>'}</button>`).join("");
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
      const r = await fetch(`${API_BASE_URL}/notificaciones/centro`, { cache: "no-store" });
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
  const n = notificaciones.find(x => x.id === id);
  if (n?.leida) return;
  if (n) n.leida = true;
  guardarCacheLocal();
  render();
  try {
    const r = await fetch(`${API_BASE_URL}/notificaciones/centro/${encodeURIComponent(id)}/leida`, { method: "PATCH" });
    if (!r.ok) throw new Error();
  } catch {
    if (n) n.leida = false;
    guardarCacheLocal();
    render();
  }
}

function abrir() {
  $("userDropdown")?.classList.add("oculto");
  const o = $("notificationCenterOverlay");
  o?.classList.remove("oculto");
  o?.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  cargar();
}

function cerrar() {
  const o = $("notificationCenterOverlay");
  o?.classList.add("oculto");
  o?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

document.addEventListener("DOMContentLoaded", () => {
  if (recuperarCacheLocal()) render();
  $("btnMenuNotificaciones")?.addEventListener("click", abrir);
  $("btnCerrarNotificationCenter")?.addEventListener("click", cerrar);
  $("notificationCenterOverlay")?.addEventListener("click", e => { if (e.target === $("notificationCenterOverlay")) cerrar(); });
  $("btnMarcarTodasLeidas")?.addEventListener("click", async () => {
    const anteriores = notificaciones.map(n => n.leida);
    notificaciones.forEach(n => n.leida = true);
    guardarCacheLocal();
    render();
    try {
      const r = await fetch(`${API_BASE_URL}/notificaciones/centro-leidas`, { method: "PATCH" });
      if (!r.ok) throw new Error();
    } catch {
      notificaciones.forEach((n, i) => n.leida = anteriores[i]);
      guardarCacheLocal();
      render();
    }
  });
  $("notificationCenterList")?.addEventListener("click", async e => {
    const b = e.target.closest(".notification-item");
    if (!b) return;
    await marcar(b.dataset.id);
    const url = decodeURIComponent(b.dataset.url || "./");
    cerrar();
    if (url.startsWith("./?") || (url && url !== "./")) location.href = url;
  });
});

window.addEventListener("autoservicio:sesion", () => cargar({ forzar: true }));
window.addEventListener("autoservicio:notificacion-creada", () => cargar({ forzar: true }));
