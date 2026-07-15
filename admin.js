import { API_BASE_URL } from "./config.js?v=531-repo-individual";

let token = "";


function mostrarEstado(texto, tipo = "") {
  const el = $("adminLoginEstado");
  if (!el) return;
  el.textContent = texto;
  el.className = `admin-login-status ${tipo}`.trim();
}

function abrirLogin() {
  $("adminLoginModal")?.classList.remove("oculto");
  $("adminLoginModal")?.setAttribute("aria-hidden", "false");
  const input = $("adminPinInput");
  if (input) { input.value = ""; setTimeout(() => input.focus(), 50); }
  mostrarEstado("");
}

function cerrarLogin() {
  $("adminLoginModal")?.classList.add("oculto");
  $("adminLoginModal")?.setAttribute("aria-hidden", "true");
}

function mostrarPanel() {
  document.querySelectorAll(".pantalla").forEach(p => p.classList.remove("activa"));
  $("pantallaAdmin")?.classList.add("activa");
  document.body.className = "en-admin";
  $("brandBackBtn")?.classList.remove("oculto");
  $("brandHeaderTitulo").textContent = "Modo administrador";
  $("brandHeaderSubtitulo").textContent = "Acceso privado";
  cargarResumen();
}

function volverAjustes() {
  document.querySelectorAll(".pantalla").forEach(p => p.classList.remove("activa"));
  $("pantallaAjustes")?.classList.add("activa");
  document.body.className = "en-ajustes";
  $("brandHeaderTitulo").textContent = "Ajustes";
  $("brandHeaderSubtitulo").textContent = "Configuración general";
}

async function login() {
  const clave = $("adminPinInput")?.value.trim();
  if (!clave) return mostrarEstado("Ingresá el PIN", "error");
  const boton = $("btnAdminIngresar");
  if (boton) boton.disabled = true;
  mostrarEstado("Verificando…");
  try {
    const r = await fetch(`${API_BASE_URL}/admin/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave })
    });
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.mensaje || "No se pudo ingresar");
    token = data.token;
    cerrarLogin();
    mostrarPanel();
  } catch (e) { mostrarEstado(e.message, "error"); }
  finally { if (boton) boton.disabled = false; }
}

async function cargarResumen() {
  token = window.AutoservicioAuth?.getToken?.() || token;
  const estado = $("adminServidorEstado");
  if (estado) estado.textContent = "Consultando servidor…";
  try {
    const r = await fetch(`${API_BASE_URL}/admin/resumen`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.mensaje || "Sesión vencida");
    $("adminVersion").textContent = `V${data.version}`;
    $("adminProductos").textContent = data.productos;
    $("adminVencimientos").textContent = data.vencimientos;
    $("adminReposicion").textContent = data.reposicionPendiente;
    if (estado) estado.textContent = "● Servidor conectado";
  } catch (e) {
    if (estado) estado.textContent = e.message;
    if (/sesión|token|vencida/i.test(e.message)) cerrarSesion();
  }
}

function cerrarSesion() { volverAjustes(); }

async function abrirAdmin() {
  if (!window.AutoservicioAuth?.esAdmin()) return;
  token = window.AutoservicioAuth.getToken();
  mostrarPanel();
}

document.addEventListener("DOMContentLoaded", () => {
  $("btnAbrirAdmin")?.addEventListener("click", abrirAdmin);
  $("btnAdminCerrarLogin")?.addEventListener("click", cerrarLogin);
  $("btnAdminIngresar")?.addEventListener("click", login);
  $("adminPinInput")?.addEventListener("keydown", e => { if (e.key === "Enter") login(); });
  $("btnAdminVolver")?.addEventListener("click", volverAjustes);
  $("btnAdminCerrarSesion")?.addEventListener("click", cerrarSesion);
  $("btnAdminActualizar")?.addEventListener("click", cargarResumen);
});
