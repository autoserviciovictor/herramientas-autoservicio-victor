import { API_BASE_URL } from "./config.js?v=533-tilde-reposicion";

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

window.fetch = async (input, init = {}) => {
  const opciones = { ...init, headers: new Headers(init.headers || (input instanceof Request ? input.headers : undefined)) };
  if (token && esApi(input)) opciones.headers.set("Authorization", `Bearer ${token}`);
  const respuesta = await originalFetch(input, opciones);
  if (respuesta.status === 401 && token && esApi(input) && !String(typeof input === "string" ? input : input.url).includes("/auth/login")) {
    cerrarSesion(false);
  }
  return respuesta;
};

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
  const nombre = usuarioActual?.nombre || usuarioActual?.usuario || "";
  if ($("sesionNombre")) $("sesionNombre").textContent = nombre;
  if ($("sesionRol")) $("sesionRol").textContent = usuarioActual?.rol === "administrador" ? "Administrador" : "Repositor";
  const adminEntry = document.querySelector(".admin-entry-card");
  if (adminEntry) adminEntry.classList.toggle("oculto", usuarioActual?.rol !== "administrador");
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

window.AutoservicioAuth = {
  getToken: () => token,
  getUsuario: () => usuarioActual,
  esAdmin: () => usuarioActual?.rol === "administrador",
  cerrarSesion
};

document.addEventListener("DOMContentLoaded", () => {
  $("btnLoginIngresar")?.addEventListener("click", iniciarSesion);
  $("loginUsuario")?.addEventListener("keydown", e => { if (e.key === "Enter") $("loginPassword")?.focus(); });
  $("loginPassword")?.addEventListener("keydown", e => { if (e.key === "Enter") iniciarSesion(); });
  $("btnCerrarSesionGeneral")?.addEventListener("click", () => cerrarSesion(true));
  validarSesion();
});
