import { API_BASE_URL } from "./config.js?v=615-notificaciones";

const TOKEN_KEY = "autoservicio_session_token";
const USER_KEY = "autoservicio_session_user";
const originalFetch = window.fetch.bind(window);
let token = localStorage.getItem(TOKEN_KEY) || "";
let usuarioActual = null;
try { usuarioActual = JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch {}

const $ = id => document.getElementById(id);

function esApi(url) {
  try { return new URL(typeof url === "string" ? url : url.url, location.href).origin === new URL(API_BASE_URL).origin; }
  catch { return false; }
}

const OFFLINE_QUEUE_KEY = "autoservicio_offline_queue_v1";
const OFFLINE_CACHE_PREFIX = "autoservicio_api_cache_v1:";
let sincronizandoOffline = false;

function leerColaOffline() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]"); } catch { return []; }
}
function guardarColaOffline(cola) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(cola));
  window.dispatchEvent(new CustomEvent("autoservicio:offline", { detail: { online: navigator.onLine, pendientes: cola.length } }));
}
function rutaApi(input) {
  try { const u = new URL(typeof input === "string" ? input : input.url, location.href); return u.pathname + u.search; } catch { return ""; }
}
function respuestaJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function esOperacionOfflinePermitida(method, ruta) {
  if (!["POST","PUT","PATCH","DELETE"].includes(method)) return false;
  return ruta.startsWith("/guardar") || ruta.startsWith("/corregir") || ruta.startsWith("/vencimientos") || ruta.startsWith("/reposicion");
}
async function serializarBody(input, init) {
  if (typeof init.body === "string") return init.body;
  if (input instanceof Request) return await input.clone().text().catch(() => "");
  return "";
}
async function sincronizarColaOffline() {
  if (sincronizandoOffline || !navigator.onLine || !token) return;
  const cola = leerColaOffline();
  if (!cola.length) return;
  sincronizandoOffline = true;
  const restantes = [];
  for (const op of cola) {
    try {
      const headers = new Headers(op.headers || {});
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("X-Offline-Operation-Id", op.id);
      const r = await originalFetch(`${API_BASE_URL}${op.ruta}`, { method: op.method, headers, body: op.body || undefined });
      if (!r.ok) {
        if (r.status >= 500) restantes.push(op);
      }
    } catch { restantes.push(op); }
  }
  guardarColaOffline(restantes);
  sincronizandoOffline = false;
  if (!restantes.length) window.dispatchEvent(new CustomEvent("autoservicio:sincronizado"));
}

window.fetch = async (input, init = {}) => {
  const opciones = { ...init, headers: new Headers(init.headers || (input instanceof Request ? input.headers : undefined)) };
  const method = String(opciones.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const ruta = rutaApi(input);
  if (token && esApi(input)) opciones.headers.set("Authorization", `Bearer ${token}`);
  try {
    const respuesta = await originalFetch(input, opciones);
    if (respuesta.status === 401 && token && esApi(input) && !ruta.includes("/auth/login")) cerrarSesion(false);
    if (esApi(input) && method === "GET" && respuesta.ok) {
      respuesta.clone().text().then(text => localStorage.setItem(OFFLINE_CACHE_PREFIX + ruta, text)).catch(() => {});
    }
    return respuesta;
  } catch (error) {
    if (!esApi(input)) throw error;
    if (method === "GET") {
      const cache = localStorage.getItem(OFFLINE_CACHE_PREFIX + ruta);
      if (cache) return new Response(cache, { status: 200, headers: { "Content-Type":"application/json", "X-Offline-Cache":"1" } });
      throw error;
    }
    if (esOperacionOfflinePermitida(method, ruta)) {
      const body = await serializarBody(input, opciones);
      const cola = leerColaOffline();
      cola.push({ id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, ruta, method, body, headers: { "Content-Type": opciones.headers.get("Content-Type") || "application/json" }, creado: Date.now() });
      guardarColaOffline(cola);
      return respuestaJson({ ok:true, offline:true, pendiente:true, mensaje:"Cambio guardado en el teléfono. Se sincronizará al recuperar Internet." });
    }
    throw error;
  }
};

window.addEventListener("online", () => sincronizarColaOffline());
setInterval(() => sincronizarColaOffline(), 15000);

function mostrarLogin(mensaje = "") {
  $("loginOverlay")?.classList.remove("oculto");
  $("loginOverlay")?.setAttribute("aria-hidden", "false");
  document.body.classList.add("login-bloqueado");
  const estado = $("loginEstado");
  if (estado) { estado.textContent = mensaje; estado.className = `login-status${mensaje ? " error" : ""}`; }
  setTimeout(() => $("loginUsuario")?.focus(), 100);
}

function ocultarLogin() {
  $("loginOverlay")?.classList.add("oculto");
  $("loginOverlay")?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("login-bloqueado");
}

function actualizarInterfazUsuario() {
  if (usuarioActual?.rol && window.AutoservicioReleaseChannel?.syncForRole?.(usuarioActual.rol)) return;
  const nombre = usuarioActual?.nombre || usuarioActual?.usuario || "";
  if ($("sesionNombre")) $("sesionNombre").textContent = nombre;
  const textoRol = usuarioActual?.rol === "administrador" ? "Administrador" : "Repositor";
  if ($("sesionRol")) $("sesionRol").textContent = textoRol;
  if ($("menuSesionNombre")) $("menuSesionNombre").textContent = nombre || "Usuario";
  if ($("menuSesionRol")) $("menuSesionRol").textContent = textoRol;
  const esAdministrador = usuarioActual?.rol === "administrador";
  const adminModule = document.querySelector(".admin-module-card");
  if (adminModule) adminModule.classList.toggle("oculto", !esAdministrador);
  const adminPanel = $("pantallaAdmin");
  if (adminPanel && !esAdministrador) {
    const estabaActivo = adminPanel.classList.contains("activa");
    adminPanel.classList.remove("activa");
    adminPanel.hidden = true;
    adminPanel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("en-admin");
    if (estabaActivo) window.AutoservicioNavigate?.("inicio");
  }
  window.dispatchEvent(new CustomEvent("autoservicio:sesion", { detail: usuarioActual }));
}

function guardarSesion(nuevoToken, usuario) {
  token = nuevoToken; usuarioActual = usuario;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(usuario));
  actualizarInterfazUsuario(); ocultarLogin();
}

function cerrarSesion(mostrar = true) {
  token = ""; usuarioActual = null;
  localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
  actualizarInterfazUsuario();
  if (mostrar) mostrarLogin(); else mostrarLogin("La sesión venció. Volvé a ingresar.");
}

async function iniciarSesion() {
  const usuario = $("loginUsuario")?.value.trim();
  const password = $("loginPassword")?.value || "";
  const boton = $("btnLoginIngresar");
  const estado = $("loginEstado");
  if (!usuario || !password) { if (estado) estado.textContent = "Ingresá usuario y contraseña"; return; }
  if (boton) boton.disabled = true;
  if (estado) { estado.textContent = "Ingresando…"; estado.className = "login-status"; }
  try {
    const r = await originalFetch(`${API_BASE_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario, password }) });
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.mensaje || "No se pudo ingresar");
    guardarSesion(data.token, data.usuario);
    if ($("loginPassword")) $("loginPassword").value = "";
  } catch (error) {
    if (estado) { estado.textContent = error.message; estado.className = "login-status error"; }
  } finally { if (boton) boton.disabled = false; }
}

async function validarSesion() {
  actualizarInterfazUsuario();
  if (!token) return mostrarLogin();
  try {
    const r = await fetch(`${API_BASE_URL}/auth/session`);
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error();
    usuarioActual = data.usuario;
    localStorage.setItem(USER_KEY, JSON.stringify(usuarioActual));
    actualizarInterfazUsuario(); ocultarLogin();
  } catch { cerrarSesion(false); }
}

function cerrarMenuUsuario() {
  const menu = $("userDropdown");
  const boton = $("brandMenuBtn");
  menu?.classList.add("oculto");
  menu?.setAttribute("aria-hidden", "true");
  boton?.setAttribute("aria-expanded", "false");
}

function alternarMenuUsuario() {
  const menu = $("userDropdown");
  const boton = $("brandMenuBtn");
  if (!menu || !boton) return;
  const abrir = menu.classList.contains("oculto");
  menu.classList.toggle("oculto", !abrir);
  menu.setAttribute("aria-hidden", String(!abrir));
  boton.setAttribute("aria-expanded", String(abrir));
}

window.AutoservicioAuth = {
  getToken: () => token,
  getUsuario: () => usuarioActual,
  esAdmin: () => usuarioActual?.rol === "administrador",
  cerrarSesion,
  sincronizarOffline: sincronizarColaOffline,
  pendientesOffline: () => leerColaOffline().length
};

document.addEventListener("DOMContentLoaded", () => {
  $("btnLoginIngresar")?.addEventListener("click", iniciarSesion);
  $("loginUsuario")?.addEventListener("keydown", e => { if (e.key === "Enter") $("loginPassword")?.focus(); });
  $("loginPassword")?.addEventListener("keydown", e => { if (e.key === "Enter") iniciarSesion(); });
  $("brandMenuBtn")?.addEventListener("click", event => { event.stopPropagation(); alternarMenuUsuario(); });
  $("userDropdown")?.addEventListener("click", event => event.stopPropagation());
  $("btnMenuAjustes")?.addEventListener("click", () => { cerrarMenuUsuario(); window.AutoservicioNavigate?.("ajustes"); });
  $("btnMenuCerrarSesion")?.addEventListener("click", () => { cerrarMenuUsuario(); cerrarSesion(true); });
  document.addEventListener("click", cerrarMenuUsuario);
  document.addEventListener("keydown", event => { if (event.key === "Escape") cerrarMenuUsuario(); });
  validarSesion();
});


function actualizarEstadoOffline(evento) {
  const el = document.getElementById("offlineStatus");
  if (!el) return;
  const pendientes = evento?.detail?.pendientes ?? leerColaOffline().length;
  const online = evento?.detail?.online ?? navigator.onLine;
  if (!online) { el.textContent = pendientes ? `Sin Internet · ${pendientes} cambios pendientes` : "Sin conexión"; el.className = "offline-status error"; }
  else if (pendientes) { el.textContent = `Sincronizando ${pendientes} cambios pendientes…`; el.className = "offline-status"; }
  else { el.className = "offline-status oculto"; }
}
window.addEventListener("autoservicio:offline", actualizarEstadoOffline);
window.addEventListener("offline", () => actualizarEstadoOffline());
window.addEventListener("online", () => actualizarEstadoOffline());
document.addEventListener("DOMContentLoaded", () => { actualizarEstadoOffline(); sincronizarColaOffline(); });
