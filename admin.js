import { API_BASE_URL } from "./config.js?v=12301";

const $ = id => document.getElementById(id);
const MODULOS_PERMISO = ["inventario", "vencimientos", "anotar", "precios", "horarios", "tareas"];
const NOMBRES_MODULO = { inventario:"Inventario", vencimientos:"Vencimientos", anotar:"Lista", precios:"Precios", horarios:"Horarios", tareas:"Tareas" };
function permisosCompatibles(permisos, rol="personal") {
  if (rol === "administrador") return Object.fromEntries(MODULOS_PERMISO.map(m => [m,true]));
  const valor = permisos && typeof permisos === "object" ? permisos : {};
  return Object.fromEntries(MODULOS_PERMISO.map(m => [m, valor[m] !== false]));
}
function leerPermisosModal() {
  return Object.fromEntries(MODULOS_PERMISO.map(m => [m, Boolean(document.querySelector(`[data-permiso-modulo="${m}"]`)?.checked)]));
}
function aplicarPermisosModal(permisos, rol="personal") {
  const valores = permisosCompatibles(permisos, rol);
  document.querySelectorAll("[data-permiso-modulo]").forEach(input => { input.checked = valores[input.dataset.permisoModulo] !== false; });
  actualizarEstadoPermisosPorRol();
}
function actualizarEstadoPermisosPorRol() {
  const rolActual = $("adminUsuarioRol")?.value || "personal";
  const esAdmin = rolActual === "administrador";
  document.querySelectorAll("[data-permiso-modulo]").forEach(input => { input.disabled = esAdmin; if (esAdmin) input.checked = true; });
  $("adminPermisosAdminAviso")?.classList.toggle("oculto", !esAdmin);
  $("adminUsuarioPermisos")?.classList.toggle("es-admin", esAdmin);
}

let usuarios = [];
let sectores = [];
let historialVencimientos = [];
let historialPeriodo = "hoy";
let historialLimite = 20;
let historialBusquedaTimer = null;
let importacionPendiente = null;
let importacionResumenPendiente = null;
let usuarioModalInicial = "";
let sectorModalInicial = "";

const IMPORTACION_HOJA_ESPERADA = "RptStockInventarioValuado";
const IMPORTACION_MIN_PRODUCTOS = 1000;

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
  $("adminProductos").textContent = data.productos;
  $("adminVencimientos").textContent = data.vencimientos;
  $("adminServidorEstado").textContent = "● Servidor conectado";
  if ($("adminVersionSistema")) $("adminVersionSistema").textContent = data.version;
}


async function cargarSectores() {
  const data = await api("/admin/sectores");
  sectores = data.sectores || [];
  renderSectores();
  poblarSectoresUsuario();
}
function sectorPorId(id){ return sectores.find(s => s.id === id); }
function etiquetaRol(valor){return ({personal:"Personal",supervisor:"Supervisor",administracion:"Administración",administrador:"Administrador"})[valor]||"Personal";}
function actualizarSelectoresUsuario(){
 const rol=$("adminUsuarioRol"), rb=$("adminUsuarioRolButton"), sec=$("adminUsuarioSector"), sb=$("adminUsuarioSectorButton"), sec2=$("adminUsuarioSectorSecundario"), sb2=$("adminUsuarioSectorSecundarioButton"), fila2=$("adminUsuarioSectorSecundarioFila");
 if(rb&&rol) rb.querySelector("span").textContent=etiquetaRol(rol.value);
 if(sb&&sec) sb.querySelector("span").textContent=sec.options[sec.selectedIndex]?.textContent||"Sin sector";
 if(sb2&&sec2) sb2.querySelector("span").textContent=sec2.options[sec2.selectedIndex]?.textContent||"Sin segundo sector";
 const esSupervisor=rol?.value==="supervisor";
 fila2?.classList.toggle("oculto",!esSupervisor);
 if(!esSupervisor && sec2){sec2.value="";if(sb2)sb2.querySelector("span").textContent="Sin segundo sector";}
}
async function abrirSelectorRolUsuario(){const sel=$("adminUsuarioRol");const v=await window.AppChoicePicker.open({title:"Seleccionar rol",kicker:"Permisos",value:sel.value,options:[{value:"personal",label:"Personal",description:"Acceso según módulos asignados"},{value:"supervisor",label:"Supervisor",description:"Administra horarios de sus sectores"},{value:"administracion",label:"Administración",description:"Acceso administrativo limitado"},{value:"administrador",label:"Administrador",description:"Acceso completo al sistema"}]});if(v){sel.value=v;sel.dispatchEvent(new Event("change",{bubbles:true}));actualizarSelectoresUsuario();}}
async function abrirSelectorSectorUsuario(secundario=false){const sel=$(secundario?"adminUsuarioSectorSecundario":"adminUsuarioSector");if(!sel)return;if(!sectores.length)await cargarSectores().catch(()=>{});const otro=$(secundario?"adminUsuarioSector":"adminUsuarioSectorSecundario")?.value||"";poblarSectoresUsuario($("adminUsuarioSector")?.value||"",$("adminUsuarioSectorSecundario")?.value||"");const opcionesSectores=sectores.filter(s=>(s.activo||s.id===sel.value)&&s.id!==otro);const options=[{value:"",label:secundario?"Sin segundo sector":"Sin sector asignado",description:secundario?"No asignar un segundo sector":"Dejar al usuario sin sector"},...opcionesSectores.map(s=>({value:s.id,label:s.nombre,color:s.color||null,description:secundario?"Asignar como segundo sector":"Asignar como sector principal"}))];const v=await window.AppChoicePicker.open({title:secundario?"Seleccionar segundo sector":"Seleccionar sector",kicker:"Usuario",value:sel.value,options});if(v!==null){sel.value=v;sel.dispatchEvent(new Event("change",{bubbles:true}));actualizarSelectoresUsuario();}}

const COLORES_ADMIN = [
  {valor:'#b72e35',nombre:'Rojo'}, {valor:'#ef4444',nombre:'Rojo claro'},
  {valor:'#f97316',nombre:'Naranja'}, {valor:'#f59e0b',nombre:'Ámbar'},
  {valor:'#eab308',nombre:'Amarillo'}, {valor:'#22c55e',nombre:'Verde'},
  {valor:'#14b8a6',nombre:'Turquesa'}, {valor:'#0ea5e9',nombre:'Celeste'},
  {valor:'#2563eb',nombre:'Azul'}, {valor:'#7c3aed',nombre:'Violeta'},
  {valor:'#db2777',nombre:'Rosa'}, {valor:'#64748b',nombre:'Gris'}
];
function normalizarColor(valor, respaldo='#b72e35'){
  const v=String(valor||'').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v)?v:respaldo;
}
function nombreColor(valor){
  const v=normalizarColor(valor);
  return COLORES_ADMIN.find(c=>c.valor===v)?.nombre || 'Color personalizado';
}
function renderPaletaColor(tipo, valor){
  const esSector=tipo==='sector';
  const input=$(esSector?'adminSectorColor':'adminHorarioColor');
  const cont=$(esSector?'adminSectorColorPalette':'adminHorarioColorPalette');
  const nombre=$(esSector?'adminSectorColorNombre':'adminHorarioColorNombre');
  if(!input||!cont)return;
  const actual=normalizarColor(valor,esSector?'#b72e35':'#f59e0b');
  input.value=actual;
  const opciones=[...COLORES_ADMIN];
  if(!opciones.some(c=>c.valor===actual)) opciones.unshift({valor:actual,nombre:'Color actual'});
  cont.innerHTML=opciones.map(c=>`<button type="button" class="admin-color-option ${c.valor===actual?'seleccionado':''}" data-color="${c.valor}" role="radio" aria-checked="${c.valor===actual}" aria-label="${c.nombre}" title="${c.nombre}"><span style="background:${c.valor}"></span></button>`).join('');
  if(nombre)nombre.textContent=nombreColor(actual);
  cont.querySelectorAll('.admin-color-option').forEach(btn=>btn.addEventListener('click',()=>{
    const elegido=normalizarColor(btn.dataset.color,actual); input.value=elegido;
    cont.querySelectorAll('.admin-color-option').forEach(x=>{const activo=x===btn;x.classList.toggle('seleccionado',activo);x.setAttribute('aria-checked',String(activo));});
    if(nombre)nombre.textContent=nombreColor(elegido);
  }));
}

function poblarSectoresUsuario(valorPreferido = null){
  const sel=$("adminUsuarioSector"); if(!sel)return;
  const actual = valorPreferido === null ? sel.value : String(valorPreferido || "");
  const opciones = sectores.filter(s => s.activo || s.id === actual);
  sel.innerHTML=`<option value="">Sin sector</option>`+opciones.map(s=>`<option value="${s.id}">${escaparHtml(s.nombre)}${s.activo ? "" : " (inactivo)"}</option>`).join("");
  sel.value = opciones.some(s => s.id === actual) ? actual : "";
  actualizarSelectoresUsuario();
}
function renderSectores(){
  const cont=$("adminSectoresLista"); if(!cont)return;
  if(!sectores.length){cont.innerHTML=`<div class="empty-state">No hay sectores.</div>`;return;}
  cont.innerHTML=sectores.map(s=>`<article class="admin-sector-card ${s.activo?'':'inactivo'}" data-sector-id="${s.id}">
    <span class="admin-sector-color" style="background:${s.color}"></span>
    <div class="admin-sector-info"><strong>${escaparHtml(s.nombre)}</strong><span>Supervisor: ${escaparHtml(s.supervisorNombre||'Sin asignar')}</span></div>
    <div class="admin-user-actions"><span class="user-status ${s.activo?'activo':'inactivo'}">${s.activo?'Activo':'Inactivo'}</span><button type="button" class="btn-editar-sector">Editar</button></div>
  </article>`).join('');
  cont.querySelectorAll('.btn-editar-sector').forEach(b=>b.addEventListener('click',()=>abrirSectorModal(sectorPorId(b.closest('[data-sector-id]').dataset.sectorId))));
}
function poblarSupervisoresSector(actual=''){
 const sel=$("adminSectorSupervisor"), btn=$("adminSectorSupervisorButton"); if(!sel)return;
 const candidatos=usuarios.filter(u=>u.activo && String(u.rol || "").trim().toLowerCase() === "supervisor");
 sel.innerHTML='<option value="">Sin supervisor</option>'+candidatos.map(u=>`<option value="${u.usuario}">${escaparHtml(u.nombre)} (@${u.usuario})</option>`).join(''); sel.value=candidatos.some(u=>u.usuario===actual)?actual:'';
 if(btn)btn.querySelector('span').textContent=sel.options[sel.selectedIndex]?.textContent||'Sin supervisor';
}
async function abrirSelectorSupervisorSector(){const sel=$("adminSectorSupervisor");if(!sel)return;const options=[...sel.options].map(o=>({value:o.value,label:o.textContent,description:o.value?'Supervisor activo':'Dejar el sector sin supervisor'}));const v=await window.AppChoicePicker.open({title:'Seleccionar supervisor',kicker:'Sector',value:sel.value,options});if(v!==null){sel.value=v;sel.dispatchEvent(new Event('change',{bubbles:true}));$("adminSectorSupervisorButton")?.querySelector('span')&&( $("adminSectorSupervisorButton").querySelector('span').textContent=sel.options[sel.selectedIndex]?.textContent||'Sin supervisor');}}
async function abrirSectorModal(sec=null){
 if (!usuarios.length) await cargarUsuarios().catch(()=>{});
 $("adminSectorModalTitulo").textContent=sec?'Editar sector':'Nuevo sector'; $("adminSectorOriginal").value=sec?.id||''; $("adminSectorNombre").value=sec?.nombre||''; renderPaletaColor("sector",sec?.color||"#b72e35"); $("adminSectorActivo").checked=sec?.activo!==false; $("adminSectorActivoFila").classList.toggle('oculto',!sec); $("btnAdminEliminarSector")?.classList.toggle("oculto",!sec); poblarSupervisoresSector(sec?.supervisor||''); $("adminSectorModal").classList.remove('oculto'); document.body.classList.add("modal-abierto");
 sectorModalInicial = estadoSectorModal();
}
function estadoSectorModal(){return JSON.stringify({nombre:$("adminSectorNombre")?.value||"",color:$("adminSectorColor")?.value||"",supervisor:$("adminSectorSupervisor")?.value||"",activo:Boolean($("adminSectorActivo")?.checked)});}
function cerrarSectorModalDirecto(){ $("adminSectorModal")?.classList.add('oculto'); document.body.classList.remove("modal-abierto"); sectorModalInicial=""; }
async function cerrarSectorModal(){
 if(!$("adminSectorModal") || $("adminSectorModal").classList.contains("oculto")) return;
 if(sectorModalInicial && estadoSectorModal()!==sectorModalInicial){
   const salir=await window.AppDialog?.confirm({titulo:"Descartar cambios",mensaje:"Hay cambios sin guardar en el sector. ¿Querés descartarlos?",confirmarTexto:"Descartar",cancelarTexto:"Seguir editando",peligro:true});
   if(!salir)return;
 }
 cerrarSectorModalDirecto();
}
function mensajeSectores(t,tipo='ok'){const e=$("adminSectoresMensaje");if(!e)return;e.textContent=t;e.className=`admin-message ${tipo}`;clearTimeout(mensajeSectores.timer);mensajeSectores.timer=setTimeout(()=>{e.textContent='';e.className='admin-message'},3500)}
async function eliminarSectorActual(){
 const id=$("adminSectorOriginal").value; if(!id)return; const sec=sectorPorId(id);
 const confirmado=await window.AppDialog?.confirm({titulo:"Eliminar sector",mensaje:`Se eliminará definitivamente el sector ${sec?.nombre || id}. Esta acción no se puede deshacer.`,confirmarTexto:"Eliminar sector",cancelarTexto:"Cancelar",peligro:true});
 if(!confirmado)return;
 const boton=$("btnAdminEliminarSector"); if(boton)boton.disabled=true;
 try{await api(`/admin/sectores/${encodeURIComponent(id)}`,{method:"DELETE"}); cerrarSectorModalDirecto(); await Promise.all([cargarSectores(),cargarUsuarios()]); mensajeSectores("Sector eliminado.");}catch(e){mensajeSectores(e.message,"error");}finally{if(boton)boton.disabled=false;}
}
async function guardarSector(){
 const original=$("adminSectorOriginal").value; const payload={nombre:$("adminSectorNombre").value.trim(),color:$("adminSectorColor").value,supervisor:$("adminSectorSupervisor").value,activo:$("adminSectorActivo").checked}; if(!payload.nombre)return mensajeSectores('Ingresá el nombre del sector.','error');
 const boton=$("btnAdminGuardarSector"); if(boton)boton.disabled=true;
 try{ if(original) await api(`/admin/sectores/${encodeURIComponent(original)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); else await api('/admin/sectores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); cerrarSectorModalDirecto(); await Promise.all([cargarSectores(),cargarUsuarios()]); mensajeSectores(original?'Sector actualizado.':'Sector creado.'); }catch(e){mensajeSectores(e.message,'error')}finally{if(boton)boton.disabled=false;}
}

async function cargarUsuarios() {
  const data = await api("/admin/usuarios");
  usuarios = data.usuarios || [];
  if ($("adminUsuariosSistema")) $("adminUsuariosSistema").textContent = usuarios.length;
  renderUsuarios();
}

function renderUsuarios() {
  const cont = $("adminUsuariosLista");
  if (!cont) return;
  if (!usuarios.length) { cont.innerHTML = '<div class="empty-state">No hay usuarios.</div>'; return; }
  cont.innerHTML = usuarios.map(u => {
    const cantidadModulos = u.rol === "administrador"
      ? MODULOS_PERMISO.length
      : MODULOS_PERMISO.filter(m => permisosCompatibles(u.permisos)[m]).length;
    const textoModulos = `${cantidadModulos} ${cantidadModulos === 1 ? "módulo disponible" : "módulos disponibles"}`;
    const rol = u.rol === "administrador" ? "Administrador" : (u.rol === "administracion" ? "Administración" : (u.rol === "supervisor" ? "Supervisor" : "Personal"));
    return `
    <article class="admin-user-card admin-user-card-v1203 ${u.activo ? "" : "inactivo"}" data-usuario="${u.usuario}">
      <span class="user-status admin-user-status-corner ${u.activo ? "activo" : "inactivo"}">${u.activo ? "Activo" : "Inactivo"}</span>
      <div class="admin-user-main">
        <div class="admin-avatar">${(u.nombre || u.usuario).slice(0,1).toUpperCase()}</div>
        <div class="admin-user-copy">
          <strong>${escaparHtml(u.nombre || u.usuario)}</strong>
          <span>@${escaparHtml(u.usuario)} · ${rol}</span>
          <span>${escaparHtml(sectorPorId(u.sector)?.nombre || "Sin sector")}</span>
          <div class="admin-user-module-count"><svg class="app-icon" aria-hidden="true"><use href="#icon-tasks"></use></svg><span>${textoModulos}</span></div>
        </div>
      </div>
      <div class="admin-user-card-buttons">
        <button type="button" class="btn-editar-usuario"><svg class="app-icon" aria-hidden="true"><use href="#icon-edit"></use></svg><span>Editar</span></button>
        <button type="button" class="btn-eliminar-usuario"><svg class="app-icon" aria-hidden="true"><use href="#icon-close"></use></svg><span>Eliminar</span></button>
      </div>
    </article>`;
  }).join("");
  cont.querySelectorAll(".btn-editar-usuario").forEach(btn => btn.addEventListener("click", () => abrirEditarUsuario(btn.closest("[data-usuario]").dataset.usuario)));
  cont.querySelectorAll(".btn-eliminar-usuario").forEach(btn => btn.addEventListener("click", () => eliminarUsuario(btn.closest("[data-usuario]").dataset.usuario)));
}

async function eliminarUsuario(clave) {
  const u=usuarios.find(x=>x.usuario===clave); if(!u)return;
  const confirmado=await window.AppDialog?.confirm({titulo:"Eliminar usuario",mensaje:`Se eliminará definitivamente a ${u.nombre || u.usuario}. Esta acción no se puede deshacer.`,confirmarTexto:"Eliminar usuario",cancelarTexto:"Cancelar",peligro:true});
  if(!confirmado)return;
  const tarjeta=document.querySelector(`[data-usuario="${CSS.escape(clave)}"]`); const botones=tarjeta?.querySelectorAll("button")||[]; botones.forEach(b=>b.disabled=true);
  try{await api(`/admin/usuarios/${encodeURIComponent(clave)}`,{method:"DELETE"}); await Promise.all([cargarUsuarios(),cargarSectores()]); mensaje("Usuario eliminado","ok");}catch(e){mensaje(e.message,"error"); botones.forEach(b=>b.disabled=false);}
}

async function abrirNuevoUsuario() {
  if (!sectores.length) await cargarSectores().catch(()=>{});
  $("adminUsuarioModalTitulo").textContent = "Crear usuario"; $("adminUsuarioModalKicker").textContent="Nuevo acceso"; $("adminUsuarioModalResumen").textContent="Completá los datos y permisos"; $("adminUsuarioAvatarModal").textContent="U";
  $("adminUsuarioOriginal").value = "";
  $("adminUsuarioNombre").value = "";
  $("adminUsuarioUsuario").value = "";
  $("adminUsuarioUsuario").disabled = false;
  $("adminUsuarioPassword").value = "";
  $("adminUsuarioPassword").placeholder = "Mínimo 4 caracteres";
  $("adminUsuarioRol").value = "personal";
  poblarSectoresUsuario("");
  aplicarPermisosModal(null, "personal");
  $("adminUsuarioActivo").checked = true;
  $("adminUsuarioActivoFila").classList.add("oculto");
  $("adminUsuarioModal").classList.remove("oculto");
  document.body.classList.add("modal-abierto");
  usuarioModalInicial = estadoUsuarioModal();
}

function abrirEditarUsuario(clave) {
  const u = usuarios.find(x => x.usuario === clave); if (!u) return;
  $("adminUsuarioModalTitulo").textContent = "Editar usuario"; $("adminUsuarioModalKicker").textContent="Gestión de usuarios"; $("adminUsuarioModalResumen").textContent=`${u.nombre} · ${etiquetaRol(u.rol)}`; $("adminUsuarioAvatarModal").textContent=(u.nombre||u.usuario||"U").slice(0,1).toUpperCase();
  $("adminUsuarioOriginal").value = u.usuario;
  $("adminUsuarioNombre").value = u.nombre;
  $("adminUsuarioUsuario").value = u.usuario;
  $("adminUsuarioUsuario").disabled = true;
  $("adminUsuarioPassword").value = "";
  $("adminUsuarioPassword").placeholder = "Dejar vacío para no cambiar";
  const rol = ["administrador","administracion","supervisor","personal"].includes(String(u.rol||"").toLowerCase()) ? String(u.rol).toLowerCase() : "personal";
  $("adminUsuarioRol").value = rol;
  poblarSectoresUsuario(u.sector || "", (u.sectores || []).find(x=>x && x!==u.sector) || "");
  aplicarPermisosModal(u.permisos, rol);
  $("adminUsuarioActivo").checked = u.activo;
  $("adminUsuarioActivoFila").classList.remove("oculto");
  $("adminUsuarioModal").classList.remove("oculto");
  document.body.classList.add("modal-abierto");
  usuarioModalInicial = estadoUsuarioModal();
}

function estadoUsuarioModal(){return JSON.stringify({nombre:$("adminUsuarioNombre")?.value||"",usuario:$("adminUsuarioUsuario")?.value||"",rol:$("adminUsuarioRol")?.value||"",sector:$("adminUsuarioSector")?.value||"",sector2:$("adminUsuarioSectorSecundario")?.value||"",activo:Boolean($("adminUsuarioActivo")?.checked),permisos:leerPermisosModal(),password:$("adminUsuarioPassword")?.value||""});}
function cerrarUsuarioModalDirecto() { $("adminUsuarioModal")?.classList.add("oculto"); document.body.classList.remove("modal-abierto"); usuarioModalInicial=""; }
async function cerrarUsuarioModal() {
  if(!$("adminUsuarioModal") || $("adminUsuarioModal").classList.contains("oculto")) return;
  if(usuarioModalInicial && estadoUsuarioModal()!==usuarioModalInicial){
    const salir=await window.AppDialog?.confirm({titulo:"Descartar cambios",mensaje:"Hay cambios sin guardar en el usuario. ¿Querés descartarlos?",confirmarTexto:"Descartar",cancelarTexto:"Seguir editando",peligro:true});
    if(!salir)return;
  }
  cerrarUsuarioModalDirecto();
}

async function guardarUsuario() {
  const original = $("adminUsuarioOriginal").value;
  const payload = {
    nombre: $("adminUsuarioNombre").value.trim(),
    usuario: $("adminUsuarioUsuario").value.trim(),
    password: $("adminUsuarioPassword").value,
    rol: $("adminUsuarioRol").value,
    permisos: leerPermisosModal(),
    sector: $("adminUsuarioSector")?.value || "",
    sectores: [$("adminUsuarioSector")?.value || "", $("adminUsuarioSectorSecundario")?.value || ""].filter(Boolean),
    activo: $("adminUsuarioActivo").checked
  };
  if(payload.rol==="supervisor" && !payload.sector) return mensaje("Seleccioná al menos un sector para el supervisor.","error");
  if(payload.sectores.length===2 && payload.sectores[0]===payload.sectores[1]) return mensaje("El segundo sector debe ser diferente del principal.","error");
  const btn = $("btnAdminGuardarUsuario"); btn.disabled = true;
  try {
    if (original) await api(`/admin/usuarios/${encodeURIComponent(original)}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    else await api("/admin/usuarios", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    cerrarUsuarioModalDirecto(); mensaje(original ? "Usuario actualizado" : "Usuario creado", "ok"); await Promise.all([cargarUsuarios(), cargarSectores()]);
  } catch(e) { mensaje(e.message, "error"); }
  finally { btn.disabled = false; }
}

function escaparHtml(valor = "") {
  return String(valor).replace(/[&<>'"]/g, caracter => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[caracter]);
}

function normalizarTexto(valor = "") {
  return String(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function fechaHistorialAFecha(valor = "", hora = "") {
  const texto = String(valor).trim();
  let partes;
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    partes = texto.split("-").map(Number);
    const [anio, mes, dia] = partes;
    const [h = 0, m = 0, seg = 0] = String(hora).split(":").map(Number);
    return new Date(anio, mes - 1, dia, h, m, seg);
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(texto)) {
    partes = texto.split("/").map(Number);
    let [dia, mes, anio] = partes;
    if (anio < 100) anio += 2000;
    const [h = 0, m = 0, seg = 0] = String(hora).split(":").map(Number);
    return new Date(anio, mes - 1, dia, h, m, seg);
  }
  const fecha = new Date(`${texto} ${hora}`.trim());
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function inicioDelDia(fecha = new Date()) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

function accionNormalizada(accion = "") {
  return normalizarTexto(accion).replace(/[^a-z]/g, "");
}

function obtenerHistorialFiltrado() {
  const usuario = $("adminHistorialUsuario")?.value || "";
  const accion = $("adminHistorialAccion")?.value || "";
  const busqueda = normalizarTexto($("adminHistorialBuscar")?.value || "");
  const ahora = new Date();
  const hoy = inicioDelDia(ahora);

  return historialVencimientos.filter(item => {
    const fecha = fechaHistorialAFecha(item.fecha, item.hora);
    if (historialPeriodo !== "todo") {
      if (!fecha) return false;
      const inicio = new Date(hoy);
      const dias = historialPeriodo === "hoy" ? 0 : Number(historialPeriodo) - 1;
      inicio.setDate(inicio.getDate() - dias);
      if (fecha < inicio || fecha > ahora) return false;
    }
    const claveUsuario = item.usuario || item.nombre || "";
    if (usuario && claveUsuario !== usuario) return false;
    if (accion && accionNormalizada(item.accion) !== accion) return false;
    if (busqueda) {
      const contenido = normalizarTexto(`${item.articulo || ""} ${item.codigo || ""}`);
      const terminos = busqueda.split(/\s+/).filter(Boolean);
      if (!terminos.every(termino => contenido.includes(termino))) return false;
    }
    return true;
  });
}

function actualizarUsuariosHistorial() {
  const select = $("adminHistorialUsuario");
  if (!select) return;
  const actual = select.value;
  const mapa = new Map();
  historialVencimientos.forEach(item => {
    const clave = item.usuario || item.nombre || "";
    if (clave) mapa.set(clave, item.nombre || item.usuario || clave);
  });
  const opciones = [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  select.innerHTML = '<option value="">Todos</option>' + opciones.map(([valor, etiqueta]) =>
    `<option value="${escaparHtml(valor)}">${escaparHtml(etiqueta)}</option>`
  ).join("");
  if ([...select.options].some(opcion => opcion.value === actual)) select.value = actual;
}

function renderResumenHistorial(items) {
  const cont = $("adminHistorialResumen");
  if (!cont) return;
  if (!items.length) {
    cont.innerHTML = "";
    return;
  }
  const usuarios = new Map();
  items.forEach(item => {
    const nombre = item.nombre || item.usuario || "Sin usuario";
    usuarios.set(nombre, (usuarios.get(nombre) || 0) + 1);
  });
  const detalle = [...usuarios.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .slice(0, 6)
    .map(([nombre, cantidad]) => `<span><strong>${escaparHtml(nombre)}</strong> ${cantidad}</span>`)
    .join("");
  cont.innerHTML = `<div><strong>${items.length}</strong><span>${items.length === 1 ? "movimiento" : "movimientos"}</span></div><div class="admin-history-summary-users">${detalle}</div>`;
}

function renderHistorialVencimientos() {
  const cont = $("adminHistorialLista");
  const botonMas = $("btnAdminHistorialMas");
  if (!cont) return;
  const filtrados = obtenerHistorialFiltrado();
  renderResumenHistorial(filtrados);
  if (!filtrados.length) {
    cont.innerHTML = '<div class="empty-state">No hay movimientos que coincidan con los filtros.</div>';
    botonMas?.classList.add("oculto");
    return;
  }
  const visibles = filtrados.slice(0, historialLimite);
  cont.innerHTML = visibles.map((h, indice) => {
    const accion = escaparHtml(h.accion || "Movimiento");
    const articulo = escaparHtml(h.articulo || "Producto");
    const usuario = escaparHtml(h.nombre || h.usuario || "Sin usuario");
    const codigo = escaparHtml(h.codigo || "");
    const vencimiento = escaparHtml(h.vencimiento || "");
    const detalle = escaparHtml(h.detalle || "");
    const claseAccion = accionNormalizada(h.accion);
    return `<article class="admin-history-card accion-${claseAccion}" data-history-index="${indice}">
      <button type="button" class="admin-history-toggle" aria-expanded="false">
        <span class="admin-history-action">${accion}</span>
        <span class="admin-history-main"><strong>${articulo}</strong><small>${escaparHtml(h.fecha || "")} ${escaparHtml(h.hora || "")} · ${usuario}</small></span>
        <span class="admin-history-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="admin-history-detail oculto">
        ${codigo ? `<p><b>Código:</b> ${codigo}</p>` : ""}
        ${vencimiento ? `<p><b>Vencimiento:</b> ${vencimiento}</p>` : ""}
        ${detalle ? `<p><b>Detalle:</b> ${detalle}</p>` : ""}
      </div>
    </article>`;
  }).join("");
  cont.querySelectorAll(".admin-history-toggle").forEach(boton => boton.addEventListener("click", () => {
    const tarjeta = boton.closest(".admin-history-card");
    const detalle = tarjeta?.querySelector(".admin-history-detail");
    const abrir = detalle?.classList.contains("oculto");
    detalle?.classList.toggle("oculto", !abrir);
    boton.setAttribute("aria-expanded", abrir ? "true" : "false");
    tarjeta?.classList.toggle("abierta", Boolean(abrir));
  }));
  botonMas?.classList.toggle("oculto", filtrados.length <= historialLimite);
}

function reiniciarPaginacionHistorial() {
  historialLimite = 20;
  renderHistorialVencimientos();
}

async function cargarHistorialVencimientos() {
  const data = await api("/admin/historial-vencimientos");
  historialVencimientos = data.historial || [];
  actualizarUsuariosHistorial();
  reiniciarPaginacionHistorial();
}

async function cargarTodo() {
  $("adminServidorEstado").textContent = "Consultando servidor…";
  try { await cargarUsuarios(); await Promise.all([cargarResumen(), cargarSectores(), cargarHistorialVencimientos()]); }
  catch(e) { $("adminServidorEstado").textContent = e.message; mensaje(e.message, "error"); }
}

function cambiarTab(tab) {
  document.querySelectorAll(".admin-tab").forEach(b => b.classList.toggle("activo", b.dataset.adminTab === tab));
  document.querySelectorAll(".admin-tab-panel").forEach(p => p.classList.toggle("oculto", p.id !== `adminTab-${tab}`));
  const encabezados = {
    usuarios: ["Usuarios", "Gestión de usuarios", "#icon-user"],
    sectores: ["Sectores", "Gestión de sectores", "#icon-building"],
    historial: ["Historial", "Actividad del sistema", "#icon-clipboard"],
    sistema: ["Sistema", "Configuración general", "#icon-settings"]
  };
  const actual = encabezados[tab] || encabezados.usuarios;
  const titulo = document.getElementById("modulePageTitle");
  const subtitulo = document.getElementById("modulePageSubtitle");
  const icono = document.getElementById("modulePageIconUse");
  if (titulo) titulo.textContent = actual[0];
  if (subtitulo) subtitulo.textContent = actual[1];
  if (icono) icono.setAttribute("href", actual[2]);
}



function abrirAdmin() {
  if (window.AutoservicioAuth?.esAdmin()) mostrarPanel();
  else ocultarPanelAdmin();
}


function normalizarEncabezadoImportacion(valor) {
  return String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function detectarColumnasImportacion(filas) {
  const alias = {
    codigo: ["codigo", "codigo de barras", "cod barra", "cod barras", "ean", "barcode"],
    articulo: ["articulo", "descripcion", "producto", "nombre articulo"],
    stock: ["stock", "existencia", "cantidad"],
    precio: ["precio", "precio venta", "precio de venta", "p venta", "importe", "venta"],
    subtotal: ["sub total", "subtotal", "total valuado", "valor total"]
  };
  for (let r=0; r<Math.min(filas.length,50); r++) {
    const normalizados=(filas[r]||[]).map(normalizarEncabezadoImportacion);
    const buscar = lista => normalizados.findIndex(v => lista.some(a => v===a || v.includes(a)));
    const encontrados = {
      codigo: buscar(alias.codigo), articulo: buscar(alias.articulo), stock: buscar(alias.stock),
      precio: buscar(alias.precio), subtotal: buscar(alias.subtotal)
    };
    if (encontrados.codigo < 0 || encontrados.articulo < 0) continue;
    const posiciones = Object.entries(encontrados).filter(([,i]) => i >= 0).sort((a,b) => a[1]-b[1]);
    const rangos = {};
    posiciones.forEach(([nombre, inicio], indice) => {
      rangos[nombre] = { inicio, fin: indice + 1 < posiciones.length ? posiciones[indice+1][1] : normalizados.length };
    });
    return { fila:r, rangos, formatoValuado: encontrados.precio >= 0 && encontrados.subtotal >= 0 };
  }
  return null;
}

function leerCampoImportacion(fila, rango) {
  if (!rango) return "";
  for (let i=rango.inicio; i<rango.fin; i++) {
    const valor=fila?.[i];
    if (valor !== null && valor !== undefined && String(valor).trim() !== "") return valor;
  }
  return "";
}

function expandirNotacionCientificaImportacion(texto) {
  const coincidencia=String(texto).match(/^([+-]?)(\d+)(?:[.,](\d+))?[eE]([+-]?\d+)$/);
  if (!coincidencia) return String(texto);
  const signo=coincidencia[1] === "-" ? "-" : "";
  const enteros=coincidencia[2];
  const decimales=coincidencia[3] || "";
  const exponente=Number(coincidencia[4]);
  if (!Number.isInteger(exponente) || Math.abs(exponente)>100) return String(texto);
  const digitos=enteros+decimales;
  const posicion=enteros.length+exponente;
  if (posicion<=0) return signo+"0".repeat(-posicion)+digitos;
  if (posicion>=digitos.length) return signo+digitos+"0".repeat(posicion-digitos.length);
  return signo+digitos.slice(0,posicion)+"."+digitos.slice(posicion);
}

function limpiarCodigoImportacion(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  let texto=String(valor).replace(/\u00a0/g," ").trim().replace(/^'+/,"").replace(/\s+/g,"");
  if (!texto) return "";
  texto=expandirNotacionCientificaImportacion(texto);
  return texto.replace(/^(\d+)[.,]0+$/, "$1");
}

function claveCodigoImportacion(valor) {
  const codigo = limpiarCodigoImportacion(valor);
  if (!codigo) return "";
  return /^\d+$/.test(codigo) ? codigo.replace(/^0+(?=\d)/, "") : codigo;
}

function parsearPrecioImportacion(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  let texto=String(valor).trim().replace(/\s/g, "").replace(/\$/g, "");
  if (!texto) return null;
  if (texto.includes(",") && texto.includes(".")) texto = texto.lastIndexOf(",") > texto.lastIndexOf(".") ? texto.replace(/\./g, "").replace(",", ".") : texto.replace(/,/g, "");
  else if (texto.includes(",")) texto=texto.replace(/\./g, "").replace(",", ".");
  const n=Number(texto); return Number.isFinite(n) && n>=0 ? n : null;
}

function abrirVistaPreviaImportacion(resumen, archivoNombre) {
  importacionResumenPendiente = resumen;
  $("adminImportarPreviewArchivo").textContent = archivoNombre;
  $("adminImportarPreviewProcesados").textContent = resumen.procesados ?? 0;
  $("adminImportarPreviewTotal").textContent = resumen.totalCatalogo ?? resumen.procesados ?? 0;

  const validaciones = Array.isArray(resumen.validaciones) ? resumen.validaciones : [];
  const cajaValidaciones = $("adminImportarPreviewValidaciones");
  if (cajaValidaciones) {
    cajaValidaciones.innerHTML = validaciones.map(item => `
      <div class="admin-import-validation ${item.ok ? "ok" : "error"}">
        <span aria-hidden="true">${item.ok ? "✓" : "✕"}</span>
        <strong>${escaparHtml(item.texto)}</strong>
      </div>`).join("");
  }

  const importacionValida = resumen.importacionValida !== false && validaciones.every(item => item.ok !== false);
  const botonConfirmar = $("btnAdminConfirmarImportacion");
  if (botonConfirmar) {
    botonConfirmar.disabled = !importacionValida;
    botonConfirmar.textContent = importacionValida ? "Reemplazar catálogo" : "Archivo no válido";
  }

  const advertencias = [];
  if (resumen.duplicadosArchivo) advertencias.push(`${resumen.duplicadosArchivo} código(s) duplicado(s) exacto(s) dentro del archivo; se conservará la última aparición`);
  if (resumen.sinCodigo) advertencias.push(`${resumen.sinCodigo} fila(s) sin código`);
  if (resumen.sinArticulo) advertencias.push(`${resumen.sinArticulo} fila(s) sin artículo`);
  if (resumen.codigosInvalidos) advertencias.push(`${resumen.codigosInvalidos} código(s) inválido(s)`);
  if (resumen.preciosInvalidos) advertencias.push(`${resumen.preciosInvalidos} precio(s) inválido(s); se guardarán vacíos`);

  const cajaAdvertencias = $("adminImportarPreviewAdvertencias");
  if (cajaAdvertencias) {
    cajaAdvertencias.innerHTML = advertencias.length
      ? `<strong>Revisar:</strong><ul>${advertencias.map(texto => `<li>${escaparHtml(texto)}</li>`).join("")}</ul>`
      : "<strong>Archivo correcto:</strong> no se detectaron filas problemáticas.";
    cajaAdvertencias.classList.toggle("sin-advertencias", advertencias.length === 0);
  }

  const modal=$("adminImportarPreviewModal");
  modal?.classList.remove("oculto"); modal?.setAttribute("aria-hidden","false");
}

function cerrarVistaPreviaImportacion() {
  const modal=$("adminImportarPreviewModal");
  modal?.classList.add("oculto"); modal?.setAttribute("aria-hidden","true");
}

function extraerProductosImportacion(filas, columnas) {
  const mapa=new Map();
  const estadisticas={
    filasVacias:0,
    sinCodigo:0,
    sinArticulo:0,
    codigosInvalidos:0,
    preciosInvalidos:0,
    duplicadosArchivo:0,
    filasIgnoradas:0
  };

  for (let i=columnas.fila+1;i<filas.length;i++) {
    const fila=filas[i]||[];
    const tieneDatos=fila.some(valor => valor !== null && valor !== undefined && String(valor).trim() !== "");
    if (!tieneDatos) { estadisticas.filasVacias++; continue; }

    const codigo=limpiarCodigoImportacion(leerCampoImportacion(fila,columnas.rangos.codigo));
    const articulo=String(leerCampoImportacion(fila,columnas.rangos.articulo)??"").trim();
    const precioOriginal=columnas.rangos.precio ? leerCampoImportacion(fila,columnas.rangos.precio) : "";
    const precio=columnas.rangos.precio ? parsearPrecioImportacion(precioOriginal) : null;

    if (!codigo) { estadisticas.sinCodigo++; estadisticas.filasIgnoradas++; continue; }
    if (!articulo) { estadisticas.sinArticulo++; estadisticas.filasIgnoradas++; continue; }
    if (!/^\d+$/.test(codigo)) { estadisticas.codigosInvalidos++; estadisticas.filasIgnoradas++; continue; }
    if (columnas.rangos.precio && String(precioOriginal ?? "").trim() !== "" && precio === null) estadisticas.preciosInvalidos++;
    const clave=claveCodigoImportacion(codigo);
    if (mapa.has(clave)) estadisticas.duplicadosArchivo++;

    // Los códigos numéricos con y sin ceros iniciales representan el mismo
    // producto (por ejemplo 00663 y 663). Se conserva la última aparición.
    mapa.set(clave,{codigo,articulo,precio});
  }
  return { productos:[...mapa.values()], ...estadisticas };
}

async function importarArchivoCatalogo(archivo) {
  if (!window.XLSX) throw new Error("No se pudo cargar el lector de Excel");
  const estado=$("adminImportarEstado");
  estado.textContent="Validando archivo…";

  const extensionValida = /\.xlsx$/i.test(archivo.name || "");
  const datos=await archivo.arrayBuffer();
  const libro=window.XLSX.read(datos,{type:"array",raw:true});
  const hojaNombre = libro.SheetNames.find(nombre => normalizarEncabezadoImportacion(nombre) === normalizarEncabezadoImportacion(IMPORTACION_HOJA_ESPERADA)) || "";
  const hojaEncontrada = Boolean(hojaNombre);
  const filas = hojaEncontrada
    ? window.XLSX.utils.sheet_to_json(libro.Sheets[hojaNombre],{header:1,defval:"",raw:false})
    : [];
  const columnas = hojaEncontrada ? detectarColumnasImportacion(filas) : null;
  const tieneCodigo = Boolean(columnas?.rangos?.codigo);
  const tieneArticulo = Boolean(columnas?.rangos?.articulo);
  const tienePrecio = Boolean(columnas?.rangos?.precio);
  const extraidos = columnas ? extraerProductosImportacion(filas,columnas) : {productos:[], filasVacias:0, sinCodigo:0, sinArticulo:0, codigosInvalidos:0, preciosInvalidos:0, duplicadosArchivo:0, filasIgnoradas:0};
  const cantidadSuficiente = extraidos.productos.length >= IMPORTACION_MIN_PRODUCTOS;

  const validaciones = [
    {ok:extensionValida, texto:"Formato XLSX válido"},
    {ok:hojaEncontrada, texto:`Hoja ${IMPORTACION_HOJA_ESPERADA} encontrada`},
    {ok:tieneCodigo, texto:"Columna Código encontrada"},
    {ok:tieneArticulo, texto:"Columna Artículo encontrada"},
    {ok:tienePrecio, texto:"Columna Precio encontrada"},
    {ok:cantidadSuficiente, texto:cantidadSuficiente ? `${extraidos.productos.length} productos detectados` : `Se requieren al menos ${IMPORTACION_MIN_PRODUCTOS} productos válidos`}
  ];
  const importacionValida = validaciones.every(item => item.ok);

  if (!importacionValida) {
    importacionPendiente = null;
    const resumen = {...extraidos, procesados:extraidos.productos.length, totalCatalogo:extraidos.productos.length, validaciones, importacionValida:false};
    delete resumen.productos;
    estado.textContent="El archivo no cumple la estructura requerida. No se modificó ningún dato.";
    abrirVistaPreviaImportacion(resumen,archivo.name);
    return;
  }

  importacionPendiente={productos:extraidos.productos, archivoNombre:archivo.name, hojaNombre, estadisticas:{...extraidos,validaciones,importacionValida:true}};
  estado.textContent=`Analizando ${extraidos.productos.length} productos…`;
  const data=await api("/admin/importar-productos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productos:extraidos.productos,confirmar:false})});
  const resumen={...(data.resumen||{}),...extraidos,validaciones,importacionValida:true};
  delete resumen.productos;
  importacionResumenPendiente=resumen;
  estado.textContent="Archivo validado. Confirmá para reemplazar completamente Productos.";
  abrirVistaPreviaImportacion(resumen,archivo.name);
}

function construirResumenImportacionFinal(r) {
  const advertencias = [];
  if (r.duplicadosArchivo) advertencias.push(`${r.duplicadosArchivo} duplicado(s) exacto(s) resuelto(s) dentro del archivo`);
  if (r.filasIgnoradas) advertencias.push(`${r.filasIgnoradas} fila(s) ignorada(s)`);
  if (r.preciosInvalidos) advertencias.push(`${r.preciosInvalidos} precio(s) inválido(s)`);
  const detalleAdvertencias = advertencias.length ? `<br><span>Advertencias: ${advertencias.join(" · ")}.</span>` : "";
  return `<strong>Catálogo reemplazado</strong><span>Se guardaron ${r.totalCatalogo||r.procesados||0} productos.</span>${detalleAdvertencias}<span>La hoja Stock no fue modificada.</span>`;
}

async function confirmarImportacionCatalogo() {
  if (!importacionPendiente) return;
  const boton=$("btnAdminConfirmarImportacion");
  const estado=$("adminImportarEstado");
  boton.disabled=true; boton.textContent="Importando…";
  try {
    const data=await api("/admin/importar-productos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productos:importacionPendiente.productos,confirmar:true})});
    const r={...(data.resumen||{}),...(importacionPendiente.estadisticas||{})};
    delete r.productos;
    cerrarVistaPreviaImportacion();
    estado.innerHTML=construirResumenImportacionFinal(r);
    importacionPendiente=null; importacionResumenPendiente=null;
    mensaje("Catálogo reemplazado", "ok");
    await cargarResumen();
  } finally {
    boton.disabled=false; boton.textContent="Reemplazar catálogo";
  }
}


document.addEventListener("DOMContentLoaded", () => {
  $("btnAbrirAdminHome")?.addEventListener("click", abrirAdmin);
  $("btnAdminActualizar")?.addEventListener("click", cargarTodo);
  $("btnAdminNuevoUsuario")?.addEventListener("click", abrirNuevoUsuario);
  $("btnAdminNuevoSector")?.addEventListener("click",()=>abrirSectorModal());
  $("btnAdminCerrarSector")?.addEventListener("click",cerrarSectorModal);
  $("btnAdminCancelarSector")?.addEventListener("click",cerrarSectorModal);
  $("btnAdminGuardarSector")?.addEventListener("click",guardarSector);
  $("adminSectorModal")?.addEventListener("click",e=>{if(e.target.id==="adminSectorModal")cerrarSectorModal()});
  document.querySelector('[data-admin-tab="sectores"]')?.addEventListener("click",cargarSectores);
  $("btnAdminCerrarUsuario")?.addEventListener("click", cerrarUsuarioModal);
  $("btnAdminCancelarUsuario")?.addEventListener("click", cerrarUsuarioModal);
  $("btnAdminGuardarUsuario")?.addEventListener("click", guardarUsuario);
  $("btnAdminEliminarUsuario")?.addEventListener("click", async () => {
    const usuario = $("adminUsuarioOriginal")?.value;
    if (!usuario) return;
    await eliminarUsuario(usuario);
    if (!usuarios.some(u => u.usuario === usuario)) cerrarUsuarioModalDirecto();
  });
  $("adminUsuarioModal")?.addEventListener("click",e=>{if(e.target.id==="adminUsuarioModal")cerrarUsuarioModal()});
  $("btnAdminEliminarSector")?.addEventListener("click", eliminarSectorActual);
  $("adminUsuarioRol")?.addEventListener("change", actualizarEstadoPermisosPorRol);
  document.querySelectorAll(".admin-tab").forEach(btn => btn.addEventListener("click", () => cambiarTab(btn.dataset.adminTab)));
  document.querySelectorAll(".admin-period-btn").forEach(btn => btn.addEventListener("click", () => {
    historialPeriodo = btn.dataset.periodo || "hoy";
    document.querySelectorAll(".admin-period-btn").forEach(item => item.classList.toggle("activo", item === btn));
    reiniciarPaginacionHistorial();
  }));
  $("adminHistorialUsuario")?.addEventListener("change", reiniciarPaginacionHistorial);
  $("adminHistorialAccion")?.addEventListener("change", reiniciarPaginacionHistorial);
  $("adminHistorialBuscar")?.addEventListener("input", () => {
    clearTimeout(historialBusquedaTimer);
    historialBusquedaTimer = setTimeout(reiniciarPaginacionHistorial, 180);
  });
  $("btnAdminImportarArchivo")?.addEventListener("click", () => $("adminImportarArchivo")?.click());
  $("adminImportarArchivo")?.addEventListener("change", async event => {
    const archivo=event.target.files?.[0];
    if (!archivo) return;
    try { await importarArchivoCatalogo(archivo); }
    catch(error) { $("adminImportarEstado").textContent=error.message; mensaje(error.message,"error"); importacionPendiente=null; }
    finally { event.target.value=""; }
  });
  $("btnAdminCancelarImportacion")?.addEventListener("click", () => { cerrarVistaPreviaImportacion(); importacionPendiente=null; importacionResumenPendiente=null; $("adminImportarEstado").textContent="Importación cancelada. No se modificó ningún dato."; });
  $("btnAdminCerrarImportacion")?.addEventListener("click", () => { cerrarVistaPreviaImportacion(); importacionPendiente=null; importacionResumenPendiente=null; });
  $("btnAdminConfirmarImportacion")?.addEventListener("click", async () => { try { await confirmarImportacionCatalogo(); } catch(error) { mensaje(error.message,"error"); $("adminImportarEstado").textContent=error.message; } });
  $("btnAdminHistorialMas")?.addEventListener("click", () => {
    historialLimite += 20;
    renderHistorialVencimientos();
  });
  ocultarPanelAdmin();
  window.addEventListener("autoservicio:sesion", (event) => {
    if (event.detail?.rol !== "administrador") ocultarPanelAdmin();
  });
});


document.getElementById("adminUsuarioRolButton")?.addEventListener("click",abrirSelectorRolUsuario);
document.getElementById("adminUsuarioSectorButton")?.addEventListener("click",()=>abrirSelectorSectorUsuario(false));
document.getElementById("adminUsuarioSectorSecundarioButton")?.addEventListener("click",()=>abrirSelectorSectorUsuario(true));
document.getElementById("adminSectorSupervisorButton")?.addEventListener("click",abrirSelectorSupervisorSector);
document.getElementById("adminUsuarioNombre")?.addEventListener("input",e=>{const av=$("adminUsuarioAvatarModal");if(av)av.textContent=(e.target.value.trim()||"U").slice(0,1).toUpperCase();});


window.AdminModule = {
  reiniciar(){
    cambiarTab("usuarios");
    const buscar=document.getElementById("adminHistorialBuscar"); if(buscar) buscar.value="";
    const usuario=document.getElementById("adminHistorialUsuario"); if(usuario) usuario.value="";
    const accion=document.getElementById("adminHistorialAccion"); if(accion) accion.value="";
    window.scrollTo({top:0,behavior:"auto"});
  }
};
