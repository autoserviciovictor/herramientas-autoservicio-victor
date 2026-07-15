import { API_BASE_URL } from "./config.js?v=603-hotfix-inicio";

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
  $("pantallaAdmin")?.setAttribute("aria-hidden", "false");
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

let historialLimite = 20;

function escaparHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function fechaHistorial(valor) {
  const partes = String(valor || "").split(/[\/\-]/).map(Number);
  if (partes.length !== 3) return null;
  const [a,b,c] = partes;
  const d = a > 1900 ? new Date(a,b-1,c) : new Date(c,b-1,a);
  d.setHours(0,0,0,0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function historialFiltrado() {
  const periodo = $("historialPeriodo")?.value || "hoy";
  const usuario = $("historialUsuario")?.value || "todos";
  const accion = $("historialAccion")?.value || "todos";
  const buscar = ($("historialBuscar")?.value || "").trim().toLocaleLowerCase("es");
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  return historialVencimientos.filter(h => {
    const fecha = fechaHistorial(h.fecha);
    if (periodo !== "todos" && fecha) {
      const dias = Math.floor((hoy - fecha) / 86400000);
      if (periodo === "hoy" && dias !== 0) return false;
      if (periodo === "7" && (dias < 0 || dias > 6)) return false;
      if (periodo === "30" && (dias < 0 || dias > 29)) return false;
    }
    if (usuario !== "todos" && String(h.usuario) !== usuario) return false;
    if (accion !== "todos" && String(h.accion) !== accion) return false;
    if (buscar) {
      const texto = `${h.articulo||""} ${h.codigo||""} ${h.nombre||""} ${h.usuario||""}`.toLocaleLowerCase("es");
      if (!texto.includes(buscar)) return false;
    }
    return true;
  });
}

function renderResumenHistorial(items) {
  const cont = $("adminHistorialResumen"); if (!cont) return;
  if (!items.length) { cont.innerHTML = ""; return; }
  const porUsuario = new Map();
  items.forEach(h => {
    const clave = h.nombre || h.usuario || "Usuario";
    porUsuario.set(clave, (porUsuario.get(clave) || 0) + 1);
  });
  const usuarios = [...porUsuario.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);
  cont.innerHTML = `<div class="history-summary-total"><strong>${items.length}</strong><span>movimientos</span></div>${usuarios.map(([nombre,cantidad])=>`<div><strong>${cantidad}</strong><span>${escaparHtml(nombre)}</span></div>`).join("")}`;
}

function renderHistorial() {
  const cont = $("adminHistorialLista"); if (!cont) return;
  const items = historialFiltrado();
  renderResumenHistorial(items);
  const visibles = items.slice(0, historialLimite);
  if (!items.length) {
    cont.innerHTML = '<div class="empty-state">No hay movimientos para estos filtros.</div>';
  } else {
    let fechaActual = "";
    cont.innerHTML = visibles.map((h, indice) => {
      const separador = h.fecha !== fechaActual ? `<div class="history-day-title">${escaparHtml(h.fecha || "Sin fecha")}</div>` : "";
      fechaActual = h.fecha;
      return `${separador}<article class="admin-history-card compacta" data-history-index="${indice}">
        <button type="button" class="history-card-toggle" aria-expanded="false">
          <div><strong>${escaparHtml(h.accion)} · ${escaparHtml(h.articulo || "Producto")}</strong><span>${escaparHtml(h.hora)} · ${escaparHtml(h.nombre || h.usuario)}</span></div><span class="history-chevron">⌄</span>
        </button>
        <div class="history-detail oculto"><small>Código: ${escaparHtml(h.codigo || "—")}</small>${h.vencimiento ? `<small>Vencimiento: ${escaparHtml(h.vencimiento)}</small>` : ""}${h.detalle ? `<p>${escaparHtml(h.detalle)}</p>` : ""}</div>
      </article>`;
    }).join("");
    cont.querySelectorAll('.history-card-toggle').forEach(btn => btn.addEventListener('click', () => {
      const detalle = btn.parentElement.querySelector('.history-detail');
      const abierto = !detalle.classList.contains('oculto');
      detalle.classList.toggle('oculto', abierto);
      btn.setAttribute('aria-expanded', String(!abierto));
    }));
  }
  const mas = $("btnHistorialCargarMas");
  if (mas) mas.classList.toggle("oculto", items.length <= historialLimite);
}

function actualizarUsuariosFiltro() {
  const select = $("historialUsuario"); if (!select) return;
  const actual = select.value;
  const mapa = new Map();
  historialVencimientos.forEach(h => mapa.set(h.usuario || h.nombre, h.nombre || h.usuario));
  select.innerHTML = '<option value="todos">Todos los usuarios</option>' + [...mapa.entries()].filter(([u])=>u).sort((a,b)=>String(a[1]).localeCompare(String(b[1]),"es")).map(([u,n])=>`<option value="${escaparHtml(u)}">${escaparHtml(n)}</option>`).join("");
  if ([...select.options].some(o=>o.value===actual)) select.value=actual;
}

async function cargarHistorialVencimientos() {
  const data = await api("/admin/historial-vencimientos");
  historialVencimientos = data.historial || [];
  historialLimite = 20;
  actualizarUsuariosFiltro();
  renderHistorial();
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
  ["historialPeriodo","historialUsuario","historialAccion"].forEach(id => $(id)?.addEventListener("change", () => { historialLimite=20; renderHistorial(); }));
  $("historialBuscar")?.addEventListener("input", () => { historialLimite=20; renderHistorial(); });
  $("btnHistorialCargarMas")?.addEventListener("click", () => { historialLimite += 20; renderHistorial(); });
  ocultarPanelAdmin();
  window.addEventListener("autoservicio:sesion", (event) => {
    if (event.detail?.rol !== "administrador") ocultarPanelAdmin();
  });
});
