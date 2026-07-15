import { API_BASE_URL } from "./config.js?v=535-admin-unificado";

const $ = id => document.getElementById(id);
let usuarios = [];
let listas = [];

function mensaje(texto, tipo = "") {
  const el = $("adminMensaje");
  if (!el) return;
  el.textContent = texto;
  el.className = `admin-message ${tipo}`.trim();
  clearTimeout(mensaje.timer);
  mensaje.timer = setTimeout(() => { el.textContent = ""; el.className = "admin-message"; }, 4500);
}

async function api(ruta, opciones = {}) {
  const r = await fetch(`${API_BASE_URL}${ruta}`, opciones);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) throw new Error(data.mensaje || "No se pudo completar la operación");
  return data;
}

function mostrarPanel() {
  document.querySelectorAll(".pantalla").forEach(p => p.classList.remove("activa"));
  $("pantallaAdmin")?.classList.add("activa");
  document.body.className = "en-admin";
  $("brandBackBtn")?.classList.remove("oculto");
  $("brandHeaderTitulo").textContent = "Administración";
  $("brandHeaderSubtitulo").textContent = "Usuarios y listas";
  cargarTodo();
}

function volverAjustes() {
  document.querySelectorAll(".pantalla").forEach(p => p.classList.remove("activa"));
  $("pantallaAjustes")?.classList.add("activa");
  document.body.className = "en-ajustes";
  $("brandHeaderTitulo").textContent = "Ajustes";
  $("brandHeaderSubtitulo").textContent = "Configuración general";
}

async function cargarResumen() {
  const data = await api("/admin/resumen");
  $("adminVersion").textContent = `V${data.version}`;
  $("adminProductos").textContent = data.productos;
  $("adminVencimientos").textContent = data.vencimientos;
  $("adminReposicion").textContent = data.reposicionPendiente;
  $("adminServidorEstado").textContent = "● Servidor conectado";
}

async function cargarUsuarios() {
  const data = await api("/admin/usuarios");
  usuarios = data.usuarios || [];
  renderUsuarios();
}

function renderUsuarios() {
  const cont = $("adminUsuariosLista");
  if (!cont) return;
  if (!usuarios.length) { cont.innerHTML = '<div class="empty-state">No hay usuarios.</div>'; return; }
  cont.innerHTML = usuarios.map(u => `
    <article class="admin-user-card ${u.activo ? "" : "inactivo"}" data-usuario="${u.usuario}">
      <div class="admin-user-main"><div class="admin-avatar">${(u.nombre || u.usuario).slice(0,1).toUpperCase()}</div><div><strong>${u.nombre}</strong><span>@${u.usuario} · ${u.rol === "administrador" ? "Administrador" : "Repositor"}</span></div></div>
      <div class="admin-user-actions"><span class="user-status ${u.activo ? "activo" : "inactivo"}">${u.activo ? "Activo" : "Inactivo"}</span><button type="button" class="btn-editar-usuario">Editar</button></div>
    </article>`).join("");
  cont.querySelectorAll(".btn-editar-usuario").forEach(btn => btn.addEventListener("click", () => abrirEditarUsuario(btn.closest("[data-usuario]").dataset.usuario)));
}

function abrirNuevoUsuario() {
  $("adminUsuarioModalTitulo").textContent = "Crear usuario";
  $("adminUsuarioOriginal").value = "";
  $("adminUsuarioNombre").value = "";
  $("adminUsuarioUsuario").value = "";
  $("adminUsuarioUsuario").disabled = false;
  $("adminUsuarioPassword").value = "";
  $("adminUsuarioPassword").placeholder = "Mínimo 4 caracteres";
  $("adminUsuarioRol").value = "repositor";
  $("adminUsuarioActivo").checked = true;
  $("adminUsuarioActivoFila").classList.add("oculto");
  $("adminUsuarioModal").classList.remove("oculto");
}

function abrirEditarUsuario(clave) {
  const u = usuarios.find(x => x.usuario === clave); if (!u) return;
  $("adminUsuarioModalTitulo").textContent = "Editar usuario";
  $("adminUsuarioOriginal").value = u.usuario;
  $("adminUsuarioNombre").value = u.nombre;
  $("adminUsuarioUsuario").value = u.usuario;
  $("adminUsuarioUsuario").disabled = true;
  $("adminUsuarioPassword").value = "";
  $("adminUsuarioPassword").placeholder = "Dejar vacío para no cambiar";
  $("adminUsuarioRol").value = u.rol;
  $("adminUsuarioActivo").checked = u.activo;
  $("adminUsuarioActivoFila").classList.remove("oculto");
  $("adminUsuarioModal").classList.remove("oculto");
}

function cerrarUsuarioModal() { $("adminUsuarioModal")?.classList.add("oculto"); }

async function guardarUsuario() {
  const original = $("adminUsuarioOriginal").value;
  const payload = {
    nombre: $("adminUsuarioNombre").value.trim(),
    usuario: $("adminUsuarioUsuario").value.trim(),
    password: $("adminUsuarioPassword").value,
    rol: $("adminUsuarioRol").value,
    activo: $("adminUsuarioActivo").checked
  };
  const btn = $("btnAdminGuardarUsuario"); btn.disabled = true;
  try {
    if (original) await api(`/admin/usuarios/${encodeURIComponent(original)}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    else await api("/admin/usuarios", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    cerrarUsuarioModal(); mensaje(original ? "Usuario actualizado" : "Usuario creado", "ok"); await cargarUsuarios();
  } catch(e) { mensaje(e.message, "error"); }
  finally { btn.disabled = false; }
}

async function cargarListas() {
  const data = await api("/admin/reposicion-listas");
  listas = data.listas || [];
  renderListas();
}

function renderListas() {
  const cont = $("adminListasLista");
  if (!cont) return;
  if (!listas.length) { cont.innerHTML = '<div class="empty-state">No hay listas activas.</div>'; return; }
  cont.innerHTML = listas.map(l => `
    <article class="admin-list-card" data-usuario="${l.usuario}">
      <button type="button" class="admin-list-open"><div><strong>${l.usuario}</strong><span>${l.pendientes} pendientes · ${l.completados} listos</span></div><b>${l.total}</b></button>
      <div class="admin-list-detail oculto">${l.registros.map(r => `<div class="admin-list-item ${r.estado}"><span>${r.articulo}<small>${r.codigo}</small></span><strong>${r.cantidad}</strong></div>`).join("")}<button type="button" class="danger-btn-soft btn-vaciar-lista">Vaciar lista de ${l.usuario}</button></div>
    </article>`).join("");
  cont.querySelectorAll(".admin-list-open").forEach(btn => btn.addEventListener("click", () => btn.nextElementSibling.classList.toggle("oculto")));
  cont.querySelectorAll(".btn-vaciar-lista").forEach(btn => btn.addEventListener("click", () => vaciarLista(btn.closest("[data-usuario]").dataset.usuario)));
}

async function vaciarLista(usuario) {
  if (!confirm(`¿Vaciar completamente la lista de ${usuario}?`)) return;
  try { await api(`/admin/reposicion-listas/${encodeURIComponent(usuario)}`, { method:"DELETE" }); mensaje("Lista eliminada", "ok"); await Promise.all([cargarListas(), cargarResumen()]); }
  catch(e) { mensaje(e.message, "error"); }
}

async function cargarTodo() {
  $("adminServidorEstado").textContent = "Consultando servidor…";
  try { await Promise.all([cargarResumen(), cargarUsuarios(), cargarListas()]); }
  catch(e) { $("adminServidorEstado").textContent = e.message; mensaje(e.message, "error"); }
}

function cambiarTab(tab) {
  document.querySelectorAll(".admin-tab").forEach(b => b.classList.toggle("activo", b.dataset.adminTab === tab));
  document.querySelectorAll(".admin-tab-panel").forEach(p => p.classList.toggle("oculto", p.id !== `adminTab-${tab}`));
}

function abrirAdmin() { if (window.AutoservicioAuth?.esAdmin()) mostrarPanel(); }

document.addEventListener("DOMContentLoaded", () => {
  $("btnAbrirAdmin")?.addEventListener("click", abrirAdmin);
  $("btnAdminVolver")?.addEventListener("click", volverAjustes);
  $("btnAdminCerrarSesion")?.addEventListener("click", () => window.AutoservicioAuth?.cerrarSesion?.(true));
  $("btnAdminActualizar")?.addEventListener("click", cargarTodo);
  $("btnAdminNuevoUsuario")?.addEventListener("click", abrirNuevoUsuario);
  $("btnAdminCerrarUsuario")?.addEventListener("click", cerrarUsuarioModal);
  $("btnAdminCancelarUsuario")?.addEventListener("click", cerrarUsuarioModal);
  $("btnAdminGuardarUsuario")?.addEventListener("click", guardarUsuario);
  document.querySelectorAll(".admin-tab").forEach(btn => btn.addEventListener("click", () => cambiarTab(btn.dataset.adminTab)));
});
