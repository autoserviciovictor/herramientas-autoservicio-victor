import { API_BASE_URL } from "./config.js?v=603-cleanup";

const $ = id => document.getElementById(id);
let usuarios = [];
let historialVencimientos = [];

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

function ocultarPanelAdmin() {
  const panel = $("pantallaAdmin");
  if (!panel) return;
  panel.classList.remove("activa");
  panel.setAttribute("aria-hidden", "true");
}

function mostrarPanel() {
  if (!window.AutoservicioAuth?.esAdmin()) {
    window.AutoservicioNavigate?.("inicio");
    return;
  }
  window.AutoservicioNavigate?.("admin");
  const panel = $("pantallaAdmin");
  if (panel) {
    panel.hidden = false;
    panel.classList.add("activa");
    panel.setAttribute("aria-hidden", "false");
  }
  cambiarTab("usuarios");
  cargarTodo();
}

async function cargarResumen() {
  const data = await api("/admin/resumen");
  $("adminVersion").textContent = `V${data.version}`;
  $("adminProductos").textContent = data.productos;
  $("adminVencimientos").textContent = data.vencimientos;
  $("adminServidorEstado").textContent = "● Servidor conectado";
  if ($("adminVersionSistema")) $("adminVersionSistema").textContent = data.version;
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

async function cargarHistorialVencimientos() {
  const data = await api("/admin/historial-vencimientos");
  historialVencimientos = data.historial || [];
  const cont = $("adminHistorialLista");
  if (!cont) return;
  if (!historialVencimientos.length) { cont.innerHTML = '<div class="empty-state">Todavía no hay movimientos registrados.</div>'; return; }
  cont.innerHTML = historialVencimientos.map(h => `<article class="admin-history-card"><div><strong>${h.accion} · ${h.articulo || "Producto"}</strong><span>${h.fecha} ${h.hora} · ${h.nombre || h.usuario}</span><small>${h.codigo || ""} ${h.vencimiento ? `· Vence ${h.vencimiento}` : ""}</small>${h.detalle ? `<p>${h.detalle}</p>` : ""}</div></article>`).join("");
}

async function cargarTodo() {
  $("adminServidorEstado").textContent = "Consultando servidor…";
  try { await Promise.all([cargarResumen(), cargarUsuarios(), cargarHistorialVencimientos()]); }
  catch(e) { $("adminServidorEstado").textContent = e.message; mensaje(e.message, "error"); }
}

function cambiarTab(tab) {
  document.querySelectorAll(".admin-tab").forEach(b => b.classList.toggle("activo", b.dataset.adminTab === tab));
  document.querySelectorAll(".admin-tab-panel").forEach(p => p.classList.toggle("oculto", p.id !== `adminTab-${tab}`));
}

function abrirAdmin() {
  if (window.AutoservicioAuth?.esAdmin()) mostrarPanel();
  else ocultarPanelAdmin();
}

document.addEventListener("DOMContentLoaded", () => {
  $("btnAbrirAdminHome")?.addEventListener("click", abrirAdmin);
  $("btnAdminActualizar")?.addEventListener("click", cargarTodo);
  $("btnAdminNuevoUsuario")?.addEventListener("click", abrirNuevoUsuario);
  $("btnAdminCerrarUsuario")?.addEventListener("click", cerrarUsuarioModal);
  $("btnAdminCancelarUsuario")?.addEventListener("click", cerrarUsuarioModal);
  $("btnAdminGuardarUsuario")?.addEventListener("click", guardarUsuario);
  document.querySelectorAll(".admin-tab").forEach(btn => btn.addEventListener("click", () => cambiarTab(btn.dataset.adminTab)));
  ocultarPanelAdmin();
  window.addEventListener("autoservicio:sesion", (event) => {
    if (event.detail?.rol !== "administrador") ocultarPanelAdmin();
  });
});
