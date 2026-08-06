import "./ui.js?v=12301";
import { API_BASE_URL } from "./config.js?v=12301";
import { parseSimpleShift, time24, shiftSegments, isSplitShift, cellLabel, fullScheduleLabel } from "./modules/horarios/schedule-format.js?v=12301";

let empleados = [];
let empleadosInfo = new Map();
let sectoresHorarios = [];
let sectorActual = "";
let contextoHorariosCargado = false;
let permisoEdicionServidor = false;
const detalles = new Map();
let metadatosModificados = false;
let resumenHoyDatos = new Map();
let resumenHoyClave = "";
const HORARIOS_CACHE_TTL = 30000;
const horariosPeticiones = new Map();
function cacheHorariosKey(tipo, extra="") { return `autoservicio_horarios_cache_v1033:${tipo}:${extra}`; }
function leerCacheHorarios(tipo, extra="") {
  try { const x=JSON.parse(localStorage.getItem(cacheHorariosKey(tipo,extra))||"null"); return x&&x.data ? x : null; } catch { return null; }
}
function guardarCacheHorarios(tipo, extra, data) {
  try { localStorage.setItem(cacheHorariosKey(tipo,extra), JSON.stringify({ts:Date.now(),data})); } catch {}
}
async function fetchHorariosUnico(url, key, {forzar=false}={}) {
  const cache=leerCacheHorarios("api",key);
  if(!forzar && cache && Date.now()-cache.ts < HORARIOS_CACHE_TTL) return cache.data;
  if(horariosPeticiones.has(key)) return horariosPeticiones.get(key);
  const prom=(async()=>{ const r=await fetch(url,{cache:"default"}); const data=await r.json(); if(!r.ok||!data.ok) throw new Error(data.mensaje||"No se pudieron cargar los horarios"); guardarCacheHorarios("api",key,data); return data; })().finally(()=>horariosPeticiones.delete(key));
  horariosPeticiones.set(key,prom); return prom;
}

function usuarioHorarios() { return window.AutoservicioAuth?.getUsuario?.() || {}; }
function rolHorarios() { return String(usuarioHorarios().rol || "").trim().toLowerCase(); }
function esAdministradorHorarios() { return rolHorarios() === "administrador"; }
function sectorSeleccionado() { return sectoresHorarios.find(s => s.id === sectorActual) || null; }
function empleadosDelSector(id = sectorActual) {
  const sector = sectoresHorarios.find(s => s.id === id);
  empleadosInfo = new Map((sector?.empleadosInfo || []).map(x=>[x.nombre,x]));
  const lista = Array.isArray(sector?.empleados) ? [...sector.empleados] : [];

  return lista;
}
function empleadosVisiblesEnTabla() { return empleados; }
function puedeEditarEmpleado(nombre){
  const rol = rolHorarios();
  if (rol === "administrador") return true;
  if (rol === "supervisor") return puedeEditar();
  return false;
}
async function cargarContextoHorarios() {
  try {
    const data = await fetchHorariosUnico(`${API_BASE_URL}/horarios/contexto`, "contexto");
    sectoresHorarios = (data.sectores || []).filter(s => s.activo !== false);
    permisoEdicionServidor = data.puedeEditar === true;
    const usuario = usuarioHorarios();
    const puedeElegirSector = ["administrador","supervisor"].includes(String(usuario.rol || "").trim().toLowerCase());
    const preferido = puedeElegirSector
      ? (sectorActual && sectoresHorarios.some(s => s.id === sectorActual) ? sectorActual : (usuario.sector || sectoresHorarios[0]?.id))
      : (usuario.sector || sectoresHorarios[0]?.id);
    sectorActual = preferido || "";
    empleados = empleadosDelSector();
    await window.AutoservicioHorariosConfig?.cargarRemoto?.(sectorActual);
    cargarTurnosConfigurados();
    await cargarCalendarioActual();
    await cargarResumenHoy(true);
    contextoHorariosCargado = true;
    renderSelectorSector();
    renderTodo();
  } catch (error) {
    const respaldo=leerCacheHorarios("api","contexto")?.data;
    if(respaldo?.sectores?.length){
      sectoresHorarios=(respaldo.sectores||[]).filter(s=>s.activo!==false);
      permisoEdicionServidor=respaldo.puedeEditar===true;
      const usuario=usuarioHorarios();
      sectorActual=(sectorActual&&sectoresHorarios.some(s=>s.id===sectorActual)?sectorActual:(usuario.sector||sectoresHorarios[0]?.id||""));
      empleados=empleadosDelSector();
    }
    contextoHorariosCargado = true;
    renderSelectorSector();
    renderTodo();
    avisoHorarios("No se pudo actualizar. Se muestran los últimos datos guardados.", "error");
  }
}
function crearSelectorSector() {
  if ($("horariosSectorBar")) return;
  const bar = document.createElement("section");
  bar.id = "horariosSectorBar";
  bar.className = "horarios-sector-bar";
  bar.innerHTML = `
    <div class="horarios-sector-identidad"><i id="horariosSectorColor"></i><div><span>Sector</span><strong id="horariosSectorNombre">—</strong></div></div>
    <div id="horariosSectorSelectorWrap" class="horarios-sector-selector oculto"><span>Cambiar sector</span><button id="horariosSectorSelectorButton" type="button" class="visual-select-button"><span>Seleccionar sector</span><svg class="app-icon"><use href="#icon-chevron-down"></use></svg></button></div>`;
  document.querySelector(".horarios-toolbar")?.after(bar);
  organizarControlesCalendario();
  $("horariosSectorSelectorButton").onclick = async () => {
    const elegido = await window.AppChoicePicker.open({
      title: "Seleccionar sector",
      kicker: "Calendario",
      value: sectorActual,
      options: sectoresHorarios.map(sec => ({
        value: sec.id,
        label: sec.nombre,
        color: sec.color,
        description: sec.id === sectorActual ? "Sector actual" : "Cambiar a este sector"
      }))
    });
    if (!elegido || elegido === sectorActual) return;
    if (modoEdicion) {
      const salio = await salirModoEdicion();
      if (!salio) return;
    }
    sectorActual = elegido;
    empleados = empleadosDelSector();
    seleccion.clear();
    diaSeleccionado = Math.min(diaSeleccionado, diasDelMes());
    await window.AutoservicioHorariosConfig?.cargarRemoto?.(sectorActual);
    cargarTurnosConfigurados();
    await cargarCalendarioActual();
    await cargarResumenHoy(true);
    renderSelectorSector();
    renderTodo();
    desplazarAlDia(esMesActual() ? new Date().getDate() : 1, "auto");
  };
}
function renderSelectorSector() {
  crearSelectorSector();
  const sector = sectorSeleccionado();
  if ($("horariosSectorNombre")) $("horariosSectorNombre").textContent = sector?.nombre || "Sin sector";
  if ($("horariosSectorColor")) $("horariosSectorColor").style.background = sector?.color || "#b72e35";
  const wrap = $("horariosSectorSelectorWrap");
  const selectButton = $("horariosSectorSelectorButton");
  if (wrap) wrap.classList.toggle("oculto", vistaActual !== "equipo" || !["administrador","supervisor"].includes(rolHorarios()) || sectoresHorarios.length < 2);
  if (selectButton) selectButton.querySelector("span").textContent = sector?.nombre || "Seleccionar sector";
  const subtitulo = $("horariosSubtituloVista");
  if (subtitulo) subtitulo.textContent = vistaActual === "equipo"
    ? `Calendario mensual de ${sector?.nombre || "este sector"}`
    : `Tus próximos turnos en ${sector?.nombre || "tu sector"}`;
}

let TURNOS = [];
function cargarTurnosConfigurados() {
  const configurados = window.AutoservicioHorariosConfig?.cargar?.() || [];
  TURNOS = configurados.map(t => ({
    ...t,
    label: t.tipo === 'cortado' ? `${t.inicio} - ${t.fin} / ${t.inicio2} - ${t.fin2}` : `${t.inicio} - ${t.fin}`,
    clase: 'turno-configurable',
    estilo: `--turno-color:${t.color};--turno-fondo:${t.color}22;--turno-borde:${t.color}66`
  })).concat([
    { id: 'franco', label: 'Franco', color:'#9ca3af', clase: 'turno-franco', estilo: 'background:#e5e7eb;color:#374151;border-color:#cbd5e1' },
    { id: 'vacaciones', label: 'Vacaciones', color:'#22c55e', clase: 'turno-vacaciones', estilo: 'background:#dcfce7;color:#15803d;border-color:#86efac' },
    { id: 'ausente', label: 'Ausente', color:'#ef4444', clase: 'turno-ausente', estilo: 'background:#fee2e2;color:#dc2626;border-color:#fca5a5' },
    { id: 'licencia', label: 'Licencia', color:'#3b82f6', clase: 'turno-licencia', estilo: 'background:#dbeafe;color:#1d4ed8;border-color:#93c5fd' }
  ]);
  if (!TURNOS.some(t => t.id === turnoPincel)) turnoPincel = TURNOS.find(t => !['franco','vacaciones'].includes(t.id))?.id || 'franco';
}


let fechaVista = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let vistaActual = "equipo";
let diaSeleccionado = new Date().getDate();
let edicionActual = null;
let restaurarBottomNav = [];
let turnoPincel = "8-16";
let arrastrando = false;
let seleccionInicio = null;
let seleccionBaseArrastre = new Set();
let punteroSeleccion = null;
let historial = [];
let estadoInicialEdicion = null;
let seleccion = new Set();
let modoEdicion = false;

cargarTurnosConfigurados();

const datos = new Map();
const $ = id => document.getElementById(id);
const keyCelda = (empleado, dia) => `${empleado}::${dia}`;

function claveMes(fecha, empleado, dia) {
  return `${sectorActual || "general"}|${fecha.getFullYear()}-${fecha.getMonth()}-${dia}-${empleado}`;
}
function clave(empleado, dia) { return claveMes(fechaVista, empleado, dia); }
function mesClave(fecha = fechaVista) { return `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,"0")}`; }
function claveResumenHoy(empleado) { return String(empleado || "").trim(); }
async function cargarResumenHoy(forzar = false) {
  if (!sectorActual) { resumenHoyDatos = new Map(); resumenHoyClave = ""; return; }
  const hoy = new Date();
  const mesHoy = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,"0")}`;
  const claveCarga = `${sectorActual}|${mesHoy}|${hoy.getDate()}`;
  if (!forzar && resumenHoyClave === claveCarga) return;
  try {
    if (mesClave() === mesHoy) {
      resumenHoyDatos = new Map(empleados.map(e => [claveResumenHoy(e), obtenerTurno(e, hoy.getDate())]));
    } else {
      const data = await fetchHorariosUnico(`${API_BASE_URL}/horarios/calendario?sector=${encodeURIComponent(sectorActual)}&mes=${mesHoy}`, `cal:${sectorActual}:${mesHoy}`);
      const mapa = new Map();
      (data.celdas || []).filter(c => Number(c.dia) === hoy.getDate()).forEach(c => mapa.set(claveResumenHoy(c.empleado), String(c.turno || "")));
      resumenHoyDatos = mapa;
    }
    resumenHoyClave = claveCarga;
  } catch (error) {
    console.warn("Horarios: no se pudo actualizar el resumen de hoy", error);
    resumenHoyDatos = new Map();
    resumenHoyClave = claveCarga;
  }
}
function limpiarMesDatos(sector = sectorActual, fecha = fechaVista) {
  const prefijo = `${sector || "general"}|${fecha.getFullYear()}-${fecha.getMonth()}-`;
  for (const k of [...datos.keys()]) if (k.startsWith(prefijo)) datos.delete(k);
}
async function cargarCalendarioActual(forzar=false) {
  if (!sectorActual) return;
  const cacheKey=`cal:${sectorActual}:${mesClave()}`;
  try {
    const data = await fetchHorariosUnico(`${API_BASE_URL}/horarios/calendario?sector=${encodeURIComponent(sectorActual)}&mes=${mesClave()}`, cacheKey, {forzar});
    limpiarMesDatos();
    (data.celdas || []).forEach(c => datos.set(clave(String(c.empleado), Number(c.dia)), String(c.turno)));
    detalles.clear();
    (data.detalles || []).forEach(x => detalles.set(keyCelda(String(x.empleado), Number(x.dia)), { tipo:x.tipo || "", motivo:x.motivo || "", observacion:x.observacion || "" }));
    metadatosModificados = false;
    if (Array.isArray(data.turnos) && data.turnos.length) {
      window.AutoservicioHorariosConfig?.guardarLocal?.(data.turnos, sectorActual);
      cargarTurnosConfigurados();
    }
  } catch (error) {
    const respaldo=leerCacheHorarios("api",cacheKey)?.data;
    if(respaldo){
      limpiarMesDatos();
      (respaldo.celdas||[]).forEach(c=>datos.set(clave(String(c.empleado),Number(c.dia)),String(c.turno)));
      detalles.clear();
      (respaldo.detalles||[]).forEach(x=>detalles.set(keyCelda(String(x.empleado),Number(x.dia)),{tipo:x.tipo||"",motivo:x.motivo||"",observacion:x.observacion||""}));
    }
    avisoHorarios("No se pudo actualizar el calendario. Se muestran los últimos datos guardados.", "error");
  }
}
function obtenerTurnoEn(fecha, e, d) { return datos.get(claveMes(fecha, e, d)) || ""; }
function obtenerTurno(e, d) { return obtenerTurnoEn(fechaVista, e, d); }
function obtenerDefinicion(id) { return TURNOS.find(t => t.id === id) || { id, label: id || '—', clase: 'turno-personalizado', estilo: '' }; }
function diasDelMes(fecha = fechaVista) { return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate(); }
function nombreMes() { return fechaVista.toLocaleDateString("es-AR", { month: "long", year: "numeric" }); }
function nombreDia(d) { return new Date(fechaVista.getFullYear(), fechaVista.getMonth(), d).toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "").toUpperCase(); }
function esMesActual() { const h = new Date(); return fechaVista.getFullYear() === h.getFullYear() && fechaVista.getMonth() === h.getMonth(); }
function esHoy(d) { return esMesActual() && d === new Date().getDate(); }
function puedeEditar() {
  if (!permisoEdicionServidor) return false;
  const sector = sectorSeleccionado();
  // El servidor es la fuente de verdad. Esto evita que una sesión antigua,
  // guardada antes de asignar varios sectores, oculte el botón Editar.
  return sector?.puedeEditar === true;
}

function parsearTurno(id) { return parseSimpleShift(id); }
function hora24(h, m = 0) { return time24(h, m); }
function definicionTurno(id){ return TURNOS.find(t => t.id === id) || null; }
function segmentosDeTurno(id) { return shiftSegments(id, TURNOS); }
function horasDeTurno(id) { return segmentosDeTurno(id)[0] || null; }
function esTurnoCortado(id){ return isSplitShift(id, TURNOS); }
function formatoCelda(id) { return cellLabel(id, TURNOS); }
function formatoHorario24(id) { return fullScheduleLabel(id, TURNOS); }
function coberturaDia(d) {
  let manana = 0, tarde = 0;
  empleados.forEach(e => {
    const segmentos = segmentosDeTurno(obtenerTurno(e, d));
    if (segmentos.some(x=>Number(x.inicio.slice(0,2)) < 14 && Number(x.fin.slice(0,2)) >= 8)) manana++;
    if (segmentos.some(x=>Number(x.inicio.slice(0,2)) < 22 && Number(x.fin.slice(0,2)) > 14)) tarde++;
  });
  return { manana, tarde };
}

function clonarDatos() { return new Map(datos); }
function mapasIguales(a, b) {
  if (!a || !b || a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}
function restaurarDatos(estado) {
  datos.clear();
  estado?.forEach((v, k) => datos.set(k, v));
}
function hayCambiosPendientes() {
  return !!(modoEdicion && ((estadoInicialEdicion && !mapasIguales(datos, estadoInicialEdicion)) || metadatosModificados));
}
function iniciarMovimiento() {
  historial.push(clonarDatos());
  if (historial.length > 80) historial.shift();
}
function descartarMovimientoSiNoCambio() {
  const anterior = historial[historial.length - 1];
  if (anterior && mapasIguales(datos, anterior)) historial.pop();
}
function deshacerUltimo() {
  if (!modoEdicion || !historial.length) return;
  restaurarDatos(historial.pop());
  renderTodo();
}
async function cancelarTodoCambios() {
  if (!modoEdicion || !hayCambiosPendientes()) return salirModoEdicion(true);
  const ok = await dialogoHorarios({
    titulo: "Cancelar todos los cambios",
    mensaje: "El calendario volverá al estado que tenía al tocar Editar.",
    confirmar: "Cancelar cambios",
    peligro: true
  });
  if (!ok) return;
  restaurarDatos(estadoInicialEdicion);
  historial = [];
  seleccion.clear();
  salirModoEdicion(true);
  renderTodo();
  avisoHorarios("Cambios descartados");
}
function serializarCeldasDesdeMapa(mapa) {
  const salida = [];
  for (let d = 1; d <= diasDelMes(); d++) empleados.forEach(empleado => {
    const turno = mapa?.get?.(clave(empleado, d)) || "";
    if (turno) salida.push({ empleado, dia:d, turno });
  });
  return salida;
}
async function confirmarGuardado() {
  if (!modoEdicion || !hayCambiosPendientes() || !puedeEditar()) return;
  const boton = $("horariosSaveChanges");
  if (boton) boton.disabled = true;
  try {
    const celdas = serializarCeldasDesdeMapa(datos);
    const baseCeldas = serializarCeldasDesdeMapa(estadoInicialEdicion || new Map());
    const respuesta = await fetch(`${API_BASE_URL}/horarios/calendario`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sector: sectorActual, mes: mesClave(), celdas, baseCeldas, detalles:[...detalles].map(([k,v])=>{const [empleado,dia]=k.split("::");return {empleado,dia:Number(dia),...v}}) })
    });
    const data = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !data.ok) throw new Error(data.mensaje || "No se pudo validar el guardado");
    guardarCacheHorarios("api",`cal:${sectorActual}:${mesClave()}`,{ok:true,sector:sectorActual,mes:mesClave(),celdas:serializarCeldasDesdeMapa(datos),detalles:[...detalles].map(([k,v])=>{const [empleado,dia]=k.split("::");return {empleado,dia:Number(dia),...v}}),turnos:window.AutoservicioHorariosConfig?.cargar?.(sectorActual)||[]});
    estadoInicialEdicion = clonarDatos();
    metadatosModificados = false;
    historial = [];
    seleccion.clear();
    await salirModoEdicion(true);
    await cargarResumenHoy(true);
    renderTodo();
    avisoHorarios("Cambios guardados");
  } catch (error) {
    avisoHorarios(error.message || "No se pudieron guardar los cambios", "error");
    actualizarAcciones();
  }
}
function actualizarAcciones() {
  const pendientes = hayCambiosPendientes();
  const acciones = $("horariosCambiosAcciones");
  acciones?.classList.toggle("oculto", !pendientes);
  if ($("horariosUndoOne")) $("horariosUndoOne").disabled = !historial.length;
  if ($("horariosSaveChanges")) $("horariosSaveChanges").disabled = !pendientes;
  if ($("horariosCancelAll")) $("horariosCancelAll").disabled = !pendientes;
  const c = $("horariosSeleccionCount");
  if (c) c.textContent = seleccion.size ? `${seleccion.size} casilla${seleccion.size > 1 ? "s" : ""} seleccionada${seleccion.size > 1 ? "s" : ""}` : "Seleccioná una o más casillas";
  const aplicar = $("horariosPaint");
  if (aplicar) aplicar.disabled = !seleccion.size || !modoEdicion;
  const limpiar = $("horariosClearSelection");
  if (limpiar) limpiar.classList.toggle("oculto", !seleccion.size);
}
function aplicarTurnoASeleccion(turno) {
  if (!seleccion.size || !puedeEditar() || !modoEdicion) return;
  iniciarMovimiento();
  seleccion.forEach(k => { const [e, d] = k.split("::"); datos.set(clave(e, Number(d)), turno); });
  descartarMovimientoSiNoCambio();
  renderTodo();
}

function etiquetaMes(fecha) {
  return fecha.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}
function avisoHorarios(texto, tipo = "ok") {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = texto;
  toast.className = `toast mostrar ${tipo}`;
  clearTimeout(avisoHorarios.timer);
  avisoHorarios.timer = setTimeout(() => { toast.className = "toast"; }, 2200);
}
function asegurarDialogoHorarios() {
  if ($("horariosDialogo")) return;
  const modal = document.createElement("div");
  modal.id = "horariosDialogo";
  modal.className = "horarios-dialogo-overlay oculto";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="horarios-dialogo-card" role="dialog" aria-modal="true" aria-labelledby="horariosDialogoTitulo">
      <span class="horarios-dialogo-kicker">Horarios</span>
      <h3 id="horariosDialogoTitulo">Confirmar acción</h3>
      <p id="horariosDialogoMensaje"></p>
      <div class="horarios-dialogo-actions">
        <button id="horariosDialogoConfirmar" type="button" class="primario">Confirmar</button>
        <button id="horariosDialogoCancelar" type="button">Volver</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}
function dialogoHorarios({ titulo, mensaje, confirmar = "Confirmar", peligro = false }) {
  asegurarDialogoHorarios();
  const modal = $("horariosDialogo");
  const btnConfirmar = $("horariosDialogoConfirmar");
  const btnCancelar = $("horariosDialogoCancelar");
  $("horariosDialogoTitulo").textContent = titulo;
  $("horariosDialogoMensaje").textContent = mensaje;
  btnConfirmar.textContent = confirmar;
  btnConfirmar.classList.toggle("peligro", peligro);
  modal.classList.remove("oculto");
  modal.setAttribute("aria-hidden", "false");
  return new Promise(resolve => {
    const cerrar = valor => {
      modal.classList.add("oculto");
      modal.setAttribute("aria-hidden", "true");
      btnConfirmar.onclick = null;
      btnCancelar.onclick = null;
      modal.onclick = null;
      resolve(valor);
    };
    btnConfirmar.onclick = () => cerrar(true);
    btnCancelar.onclick = () => cerrar(false);
    modal.onclick = e => { if (e.target === modal) cerrar(false); };
  });
}
function actualizarSelectorTurnos() {
  const opcion = TURNOS.find(t=>t.id===turnoPincel) || TURNOS.filter(t=>t.id!=="personalizado")[0];
  if (!opcion) return;
  turnoPincel=opcion.id;
  const label=$("horariosPaintLabel"), swatch=$("horariosPaintSwatch");
  if(label) label.textContent=opcion.label;
  if(swatch){
    const coloresEspeciales={franco:"#9ca3af",vacaciones:"#22c55e",ausente:"#ef4444",licencia:"#3b82f6"};
    const color=opcion.color||coloresEspeciales[opcion.id]||"#ffffff";
    const iniciales={franco:"F",vacaciones:"V",ausente:"A",licencia:"L"};
    swatch.style.background=color;
    swatch.textContent=iniciales[opcion.id]||(opcion.tipo==="cortado"?"C":"");
    swatch.style.color=contrasteTurno(color);
    swatch.className=`turno-${opcion.id}`;
  }
}

function organizarControlesCalendario() {
  const content = document.querySelector("#pantallaHorarios .horarios-content");
  const toolbar = document.querySelector("#pantallaHorarios .horarios-toolbar");
  const sector = $("horariosSectorBar");
  const editor = $("horariosEdicionMarco");
  const status = document.querySelector("#pantallaHorarios .horarios-status-row");
  if (!content || !toolbar || !sector || !editor) return;
  let deck = $("horariosControlDeck");
  if (!deck) {
    deck = document.createElement("section");
    deck.id = "horariosControlDeck";
    deck.className = "horarios-control-deck";
    content.insertBefore(deck, toolbar);
  }
  if (toolbar.parentElement !== deck) deck.appendChild(toolbar);
  if (sector.parentElement !== deck) deck.appendChild(sector);
  if (editor.parentElement !== deck) deck.appendChild(editor);
  if (status && status.parentElement !== deck) deck.appendChild(status);
}

function crearPanelEdicion() {
  if ($("horariosEdicionMarco")) return;
  const marco = document.createElement("section");
  marco.id = "horariosEdicionMarco";
  marco.className = "horarios-edicion-marco";
  marco.innerHTML = `
    <div id="horariosConsultaAcciones" class="horarios-consulta-acciones">
      <button id="btnHorariosEditar" type="button" class="horarios-editar-btn">Editar</button>
    </div>
    <div id="horariosPanelEdicion" class="horarios-panel-edicion oculto" aria-hidden="true">
      <div class="horarios-panel-head">
        <div><span>Modo edición</span><strong id="horariosPanelMes">Editar mes</strong></div>
        <button id="btnHorariosCerrarEdicion" type="button" aria-label="Cerrar edición">✕</button>
      </div>
      <div class="horarios-pintar-control">
        <div class="horarios-paint-picker"><span>Pintar con</span><button id="horariosPaintTurnoButton" type="button" class="visual-select-button"><i id="horariosPaintSwatch"></i><span id="horariosPaintLabel">Seleccionar horario</span><svg class="app-icon"><use href="#icon-chevron-down"></use></svg></button></div>
        <button id="horariosPaint" type="button" disabled>Aplicar</button>
      </div>
      <div class="horarios-seleccion-info">
        <small id="horariosSeleccionCount" class="horarios-seleccion-count">Seleccioná una o más casillas</small>
        <button id="horariosClearSelection" type="button" class="horarios-limpiar-seleccion oculto">Limpiar selección</button>
      </div>
      <div id="horariosCambiosAcciones" class="horarios-cambios-acciones oculto">
        <button id="horariosSaveChanges" type="button" class="primario">Guardar</button>
        <button id="horariosUndoOne" type="button">Deshacer</button>
        <button id="horariosCancelAll" type="button" class="peligro">Cancelar todo</button>
      </div>
    </div>`;
  document.querySelector(".horarios-status-row")?.after(marco);
  organizarControlesCalendario();
  $("btnHorariosEditar").onclick = entrarModoEdicion;
  $("btnHorariosCerrarEdicion").onclick = () => salirModoEdicion();
  $("horariosPaint").onclick = () => aplicarTurnoASeleccion(turnoPincel);
  const abrirSelectorTurnos = async (evento) => {
    evento?.preventDefault?.();
    evento?.stopPropagation?.();
    const picker = window.AppChoicePicker;
    if (!picker?.open) {
      avisoHorarios("No se pudo abrir el selector de horarios. Recargá la aplicación e intentá nuevamente.", "error");
      return;
    }
    const iniciales = { franco:"F", vacaciones:"V", ausente:"A", licencia:"L" };
    const descripciones = { franco:"Día libre", vacaciones:"Vacaciones", ausente:"Ausencia", licencia:"Licencia" };
    const opciones = TURNOS.filter(t=>t.id!=="personalizado").map(t=>({
      value:t.id,
      label:t.label,
      color:t.color||({franco:"#e5e7eb",vacaciones:"#22c55e",ausente:"#ef4444",licencia:"#3b82f6"}[t.id]||"#ffffff"),
      badge:iniciales[t.id]||(t.tipo==="cortado"?"C":""),
      description:descripciones[t.id]||(t.tipo==="cortado"?"Horario cortado":"Horario continuo")
    }));
    const elegido = await picker.open({title:"Seleccionar horario",kicker:"Pintar con",options:opciones,value:turnoPincel});
    if (elegido !== null && elegido !== undefined && elegido !== "") {
      turnoPincel=elegido;
      actualizarSelectorTurnos();
    }
  };
  const botonSelectorTurnos = $("horariosPaintTurnoButton");
  botonSelectorTurnos.addEventListener("click", abrirSelectorTurnos);
  botonSelectorTurnos.addEventListener("pointerdown", evento => evento.stopPropagation());
  $("horariosClearSelection").onclick = () => {
    seleccion.clear();
    renderTabla();
    actualizarAcciones();
  };
  $("horariosSaveChanges").onclick = confirmarGuardado;
  $("horariosUndoOne").onclick = deshacerUltimo;
  $("horariosCancelAll").onclick = cancelarTodoCambios;
  actualizarSelectorTurnos();
  actualizarPermisos();
  actualizarAcciones();
}
function entrarModoEdicion() {
  if (!puedeEditar()) return;
  modoEdicion = true;
  estadoInicialEdicion = clonarDatos();
  historial = [];
  arrastrando = false;
  punteroSeleccion = null;
  seleccionBaseArrastre.clear();
  document.body.classList.add("horarios-modo-edicion");
  $("horariosConsultaAcciones")?.classList.add("oculto");
  $("horariosPanelEdicion")?.classList.remove("oculto");
  $("horariosPanelEdicion")?.setAttribute("aria-hidden", "false");
  actualizarPanelMes();
  renderTabla();
}
async function salirModoEdicion(forzar = false) {
  if (!forzar && hayCambiosPendientes()) {
    const ok = await dialogoHorarios({
      titulo: "Salir sin guardar",
      mensaje: "Hay cambios pendientes. Si salís ahora, se descartarán.",
      confirmar: "Descartar y salir",
      peligro: true
    });
    if (!ok) return false;
    restaurarDatos(estadoInicialEdicion);
  }
  modoEdicion = false;
  arrastrando = false;
  punteroSeleccion = null;
  seleccionBaseArrastre.clear();
  historial = [];
  estadoInicialEdicion = null;
  seleccion.clear();
  cerrarEditor();
  document.body.classList.remove("horarios-modo-edicion");
  $("horariosConsultaAcciones")?.classList.remove("oculto");
  $("horariosPanelEdicion")?.classList.add("oculto");
  $("horariosPanelEdicion")?.setAttribute("aria-hidden", "true");
  renderTabla();
  actualizarAcciones();
  return true;
}
function actualizarPanelMes() {
  const el = $("horariosPanelMes");
  if (el) el.textContent = `Editar ${nombreMes()}`;
}

function actualizarPermisos() {
  const editable = puedeEditar();
  document.body.classList.toggle("horarios-solo-lectura", !editable);
  $("horariosEdicionMarco")?.classList.toggle("oculto", !editable || vistaActual !== "equipo");
  $("horariosEditor")?.classList.toggle("sin-permiso", !editable);
  document.querySelector(".horarios-personal-actions")?.classList.toggle("oculto", !editable || vistaActual !== "equipo");
  if (!editable && modoEdicion) salirModoEdicion();
}

function desplazarAlDia(d, behavior = "smooth") {
  requestAnimationFrame(() => {
    const w = document.querySelector("#horariosEquipoView .horarios-table-wrap");
    const c = document.querySelector(`#horariosTablaHead [data-horarios-dia="${d}"]`);
    const e = document.querySelector("#horariosTablaHead .empleado-col");
    if (w && c) w.scrollTo({ left: Math.max(0, c.offsetLeft - (e?.offsetWidth || 0) - 12), behavior });
  });
}
function actualizarColumnaEmpleados() {
  const w = document.querySelector("#horariosEquipoView .horarios-table-wrap"), t = document.querySelector("#horariosEquipoView .horarios-table");
  if (!w || !t) return;
  t.classList.toggle("empleados-compactos", w.scrollLeft > 32);
  t.classList.toggle("empleados-minimos", w.scrollLeft > 240);
}
function alternarCelda(e, d) {
  if (!puedeEditar() || !modoEdicion) return;
  const k = keyCelda(e, d);
  if (seleccion.has(k)) seleccion.delete(k); else seleccion.add(k);
  renderTabla();
  actualizarAcciones();
}
function seleccionarRango(e2, d2) {
  if (!seleccionInicio || !puedeEditar() || !modoEdicion) return;
  const i1 = empleados.indexOf(seleccionInicio.empleado), i2 = empleados.indexOf(e2), d1 = seleccionInicio.dia;
  seleccion = new Set(seleccionBaseArrastre);
  for (let i = Math.min(i1, i2); i <= Math.max(i1, i2); i++) {
    for (let d = Math.min(d1, d2); d <= Math.max(d1, d2); d++) if (puedeEditarEmpleado(empleados[i])) seleccion.add(keyCelda(empleados[i], d));
  }
  renderTabla();
  actualizarAcciones();
}
function celdaDesdePunto(x, y) {
  return document.elementFromPoint(x, y)?.closest?.("#horariosTablaBody td[data-empleado]") || null;
}
function renderTabla() {
  const head = $("horariosTablaHead"), body = $("horariosTablaBody");
  if (!head || !body) return;
  head.innerHTML = `<tr><th class="empleado-col"><span class="empleado-titulo-completo">Empleado</span><span class="empleado-titulo-corto">Emp.</span></th>${Array.from({ length: diasDelMes() }, (_, i) => {
    const d = i + 1, f = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), d), finde = [0, 6].includes(f.getDay()), c = coberturaDia(d);
    return `<th class="${finde ? "fin-semana" : ""} ${esHoy(d) ? "dia-hoy" : ""} ${d === diaSeleccionado ? "dia-seleccionado" : ""}" data-horarios-dia="${d}"><span>${nombreDia(d)}</span><strong>${d}</strong><small class="cobertura-mini"><b>☀${c.manana}</b><b>☾${c.tarde}</b></small></th>`;
  }).join("")}</tr>`;
  const empleadosTabla = empleadosVisiblesEnTabla();
  body.innerHTML = empleadosTabla.length ? empleadosTabla.map(e => `<tr><th class="empleado-col"><span class="empleado-avatar">${e[0]}</span><strong>${e}</strong></th>${Array.from({ length: diasDelMes() }, (_, i) => {
    const d = i + 1, id = obtenerTurno(e, d), t = obtenerDefinicion(id), sel = seleccion.has(keyCelda(e, d));
    const detalle = detalles.get(keyCelda(e,d));
    const marcas = `${detalle?.observacion || detalle?.motivo ? '<i class="horario-nota-dot" title="Tiene observación"></i>' : ''}`;
    return `<td class="${esHoy(d) ? "dia-hoy" : ""} ${d === diaSeleccionado ? "dia-seleccionado" : ""} ${sel ? "celda-seleccionada" : ""}" data-empleado="${e}" data-dia="${d}"><button type="button" class="horario-cell ${t.clase}" style="${t.estilo || ''}" data-tooltip="${t.label}">${formatoCelda(id)}${marcas}</button></td>`;
  }).join("")}</tr>`).join("") : `<tr><td colspan="${diasDelMes() + 1}" class="horarios-sin-empleados"><strong>No hay empleados asignados a este sector</strong><span>Asigná usuarios desde Administrador → Usuarios.</span></td></tr>`;
  head.querySelectorAll("[data-horarios-dia]").forEach(x => x.onclick = () => { diaSeleccionado = Number(x.dataset.horariosDia); renderTabla(); renderResumen(); });
  body.querySelectorAll("td[data-empleado]").forEach(td => {
    td.onpointerdown = ev => {
      if (!puedeEditar() || !modoEdicion || (ev.pointerType === "mouse" && ev.button !== 0)) return;
      const emp = td.dataset.empleado, dia = Number(td.dataset.dia);
      punteroSeleccion = { id: ev.pointerId, tipo: ev.pointerType, x: ev.clientX, y: ev.clientY, empleado: emp, dia, movio: false };
      seleccionInicio = { empleado: emp, dia };
      seleccionBaseArrastre = (ev.ctrlKey || ev.metaKey) ? new Set(seleccion) : new Set();
      arrastrando = ev.pointerType !== "touch";
      if (arrastrando) ev.preventDefault();
    };
    td.ondblclick = ev => { ev.preventDefault(); ev.stopPropagation(); };
  });
  const w = document.querySelector("#horariosEquipoView .horarios-table-wrap");
  if (w && !w.dataset.cfg) { w.dataset.cfg = "1"; w.addEventListener("scroll", actualizarColumnaEmpleados, { passive: true }); }
  actualizarColumnaEmpleados();
}
document.addEventListener("pointermove", ev => {
  if (!punteroSeleccion || ev.pointerId !== punteroSeleccion.id || !modoEdicion) return;
  const distancia = Math.hypot(ev.clientX - punteroSeleccion.x, ev.clientY - punteroSeleccion.y);
  const umbral = punteroSeleccion.tipo === "touch" ? 18 : 6;
  if (distancia < umbral) return;
  punteroSeleccion.movio = true;
  if (punteroSeleccion.tipo === "touch") return;
  arrastrando = true;
  ev.preventDefault();
  const td = celdaDesdePunto(ev.clientX, ev.clientY);
  if (td) seleccionarRango(td.dataset.empleado, Number(td.dataset.dia));
}, { passive: false });
document.addEventListener("pointerup", ev => {
  if (!punteroSeleccion || ev.pointerId !== punteroSeleccion.id) return;
  const p = punteroSeleccion;
  if (!p.movio) alternarCelda(p.empleado, p.dia);
  arrastrando = false;
  punteroSeleccion = null;
  seleccionInicio = null;
  seleccionBaseArrastre.clear();
});
document.addEventListener("pointercancel", () => {
  arrastrando = false;
  punteroSeleccion = null;
  seleccionInicio = null;
  seleccionBaseArrastre.clear();
});

function renderResumen() {
  const t = $("horariosDiaSeleccionado"), c = $("horariosResumenDia");
  if (!t || !c) return;
  const hoy = new Date();
  t.textContent = hoy.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const filas = empleados.map(e => {
    const id = resumenHoyDatos.get(claveResumenHoy(e)) || "";
    const x = obtenerDefinicion(id);
    return `<div class="horarios-resumen-persona"><span><i class="${x.clase}" style="${x.estilo || ''}"></i><strong>${e}</strong></span><b>${formatoHorario24(id)}</b></div>`;
  });
  c.innerHTML = filas.length ? filas.join("") : '<div class="horarios-resumen-vacio">No hay personal asignado a este sector.</div>';
  renderEstadisticasSector();
}
function renderEstadisticasSector(){
  const box=$("horariosEstadisticas"); if(!box) return;
  let horas=0,francos=0,vacaciones=0,licencias=0,ausencias=0;
  empleados.forEach(e=>{for(let d=1;d<=diasDelMes();d++){const id=obtenerTurno(e,d),segmentos=segmentosDeTurno(id);if(segmentos.length)segmentos.forEach(x=>{const [ih,im]=x.inicio.split(':').map(Number),[fh,fm]=x.fin.split(':').map(Number);horas+=(fh+fm/60)-(ih+im/60)});else if(id==="franco")francos++;else if(id==="vacaciones")vacaciones++;else if(id==="licencia")licencias++;else if(id==="ausente")ausencias++;}});
  box.innerHTML=`<article><strong>${empleados.length}</strong><span>Empleados</span></article><article><strong>${Math.round(horas)}</strong><span>Horas</span></article><article><strong>${francos}</strong><span>Francos</span></article><article><strong>${vacaciones}</strong><span>Vacaciones</span></article><article><strong>${licencias}</strong><span>Licencias</span></article><article><strong>${ausencias}</strong><span>Ausencias</span></article>`;
}
function abrirEditor(e, d) {
  if (!puedeEditar() || !modoEdicion) return;
  edicionActual = { empleado: e, dia: d, turno: obtenerTurno(e, d) };
  $("horariosEditorEmpleado").textContent = seleccion.size > 1 ? `${seleccion.size} turnos` : e;
  $("horariosEditorFecha").textContent = seleccion.size > 1 ? "Aplicar a la selección" : new Date(fechaVista.getFullYear(), fechaVista.getMonth(), d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const o = $("horariosTurnosOpciones");
  o.innerHTML = TURNOS.map(t => `<button type="button" class="horarios-turno-option ${t.clase} ${t.id === edicionActual.turno ? "seleccionado" : ""}" style="${t.estilo || ''}" data-turno="${t.id}"><span></span><strong>${t.label}</strong></button>`).join("");
  o.querySelectorAll("[data-turno]").forEach(btn => btn.onclick = () => {
    edicionActual.turno = btn.dataset.turno;
    o.querySelectorAll("[data-turno]").forEach(b => b.classList.toggle("seleccionado", b === btn));
    $("horariosCustomWrap").classList.toggle("oculto", btn.dataset.turno !== "personalizado");
    $("horariosLicenciaWrap").classList.toggle("oculto", btn.dataset.turno !== "licencia");
  });
  $("horariosCustomWrap").classList.toggle("oculto", edicionActual.turno !== "personalizado" && TURNOS.some(t => t.id === edicionActual.turno));
  $("horariosTurnoPersonalizado").value = TURNOS.some(t => t.id === edicionActual.turno) ? "" : edicionActual.turno;
  const det = detalles.get(keyCelda(e,d)) || {};
  $("horariosLicenciaMotivo").value = det.motivo || "";
  $("horariosObservacion").value = det.observacion || "";
  $("horariosLicenciaWrap").classList.toggle("oculto", edicionActual.turno !== "licencia");
  $("horariosEditor").classList.remove("oculto");
  $("horariosEditor").setAttribute("aria-hidden", "false");
}
function cerrarEditor() { $("horariosEditor")?.classList.add("oculto"); $("horariosEditor")?.setAttribute("aria-hidden", "true"); edicionActual = null; }
function guardarEdicion() {
  if (!edicionActual || !puedeEditar() || !modoEdicion) return;
  let turno = edicionActual.turno;
  if (turno === "personalizado") { turno = $("horariosTurnoPersonalizado").value.trim(); if (!parsearTurno(turno)) return $("horariosTurnoPersonalizado").focus(); }
  const detalleNuevo = { tipo: turno, motivo: turno === "licencia" ? $("horariosLicenciaMotivo").value : "", observacion: $("horariosObservacion").value.trim() };
  if (seleccion.size > 1) {
    aplicarTurnoASeleccion(turno);
    seleccion.forEach(k => detalles.set(k, {...detalleNuevo}));
    metadatosModificados = true;
  } else {
    iniciarMovimiento();
    datos.set(clave(edicionActual.empleado, edicionActual.dia), turno);
    if (detalleNuevo.motivo || detalleNuevo.observacion || ["licencia","ausente","vacaciones"].includes(turno)) detalles.set(keyCelda(edicionActual.empleado,edicionActual.dia), detalleNuevo); else detalles.delete(keyCelda(edicionActual.empleado,edicionActual.dia));
    metadatosModificados = true;
    descartarMovimientoSiNoCambio();
    renderTodo();
  }
  cerrarEditor();
}

function encontrarProximoTurno(empleado) {
  const ahora = new Date();
  for (let offset = 0; offset < 370; offset++) {
    const fecha = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + offset);
    const mes = new Date(fecha.getFullYear(), fecha.getMonth(), 1), dia = fecha.getDate();
    const id = obtenerTurnoEn(mes, empleado, dia);
    const segmentos = segmentosDeTurno(id);
    if (!segmentos.length) continue;
    for (const tramo of segmentos) {
      const [inicioH, inicioM] = tramo.inicio.split(":").map(Number);
      const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), inicioH, inicioM || 0);
      if (inicio > ahora) return { fecha, id, tramo };
    }
  }
  return null;
}
function normalizarIdentidadHorario(valor) {
  return String(valor || "").trim().toLocaleLowerCase("es-AR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function resolverEmpleadoSesion(usuario) {
  const nombre = normalizarIdentidadHorario(usuario?.nombre);
  const usuarioId = normalizarIdentidadHorario(usuario?.usuario);
  return empleados.find(empleado => {
    const info = empleadosInfo.get(empleado) || {};
    return normalizarIdentidadHorario(empleado) === nombre
      || normalizarIdentidadHorario(info.nombre) === nombre
      || normalizarIdentidadHorario(info.usuario) === usuarioId;
  }) || "";
}
function renderMiHorario() {
  const usuario = window.AutoservicioAuth?.getUsuario?.() || {};
  const e = resolverEmpleadoSesion(usuario);
  const lista = $("miHorarioLista"); if (!lista) return;
  $("miHorarioStats")?.remove();
  const saludo = document.querySelector(".mi-horario-saludo");
  if (saludo) saludo.textContent = `Hola, ${usuario?.nombre || usuario?.usuario || "Usuario"}`;

  const hoy = new Date();
  const fechaHoyTexto = hoy.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

  if (!e) {
    lista.innerHTML = '<div class="mi-horario-vacio"><strong>Sin horarios asignados</strong><span>Tu usuario no tiene turnos cargados en este sector.</span></div>';
    $("miHorarioProximo").textContent = "Sin asignar";
    $("miHorarioProximoFecha").textContent = fechaHoyTexto;
    return;
  }

  const mesHoy = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const turnoHoy = resumenHoyDatos.get(claveResumenHoy(e)) || obtenerTurnoEn(mesHoy, e, hoy.getDate()) || "";
  $("miHorarioProximo").textContent = turnoHoy ? formatoHorario24(turnoHoy) : "Sin asignar";
  $("miHorarioProximoFecha").textContent = fechaHoyTexto;

  const fechas = [];
  for (let offset = 1; offset <= 14 && fechas.length < 10; offset++) {
    const f = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + offset);
    // Los datos disponibles en pantalla corresponden al mes actualmente cargado.
    if (f.getFullYear() !== fechaVista.getFullYear() || f.getMonth() !== fechaVista.getMonth()) continue;
    fechas.push(f);
  }

  lista.innerHTML = fechas.length ? fechas.map(f => {
    const id = obtenerTurnoEn(new Date(f.getFullYear(), f.getMonth(), 1), e, f.getDate());
    const tr = obtenerDefinicion(id);
    return `<article><div><span>${f.toLocaleDateString("es-AR", { weekday: "long" })}</span><strong>${f.getDate()} de ${f.toLocaleDateString("es-AR", { month: "long" })}</strong></div><span class="mi-turno-pill ${tr.clase}" style="${tr.estilo || ''}">${id ? formatoHorario24(id) : "Sin asignar"}</span></article>`;
  }).join("") : '<div class="mi-horario-vacio"><strong>Sin próximos horarios</strong><span>No hay más días disponibles en el mes cargado.</span></div>';
}


function puedeVerConfiguracion(){ return ["administrador","supervisor"].includes(rolHorarios()) && sectorSeleccionado()?.puedeEditar===true; }
function cambiarVista(v) {
  vistaActual = v;
  const eq = v === "equipo", mio=v === "mio", cfg=v === "config";
  document.body.classList.toggle("horarios-vista-calendario", eq);
  document.body.classList.toggle("horarios-vista-mio", mio);
  document.body.classList.toggle("horarios-vista-config", cfg);
  $("horariosEquipoView")?.classList.toggle("oculto", !eq);
  $("horariosMioView")?.classList.toggle("oculto", !mio);
  $("horariosConfigView")?.classList.toggle("oculto", !cfg);
  const titulosVista = eq ? ["Calendario", "Turnos del equipo"] : (mio ? ["Mi horario", "Horario personal"] : ["Configuración", "Administrar horarios"]);
  if ($("modulePageTitle")) $("modulePageTitle").textContent = titulosVista[0];
  if ($("modulePageSubtitle")) $("modulePageSubtitle").textContent = titulosVista[1];
  if ($("horariosTituloVista")) $("horariosTituloVista").textContent = titulosVista[0];
  if ($("horariosSubtituloVista")) $("horariosSubtituloVista").textContent = titulosVista[1];
  document.querySelectorAll("[data-horarios-vista]").forEach(b => b.classList.toggle("activo", b.dataset.horariosVista === v));
  renderSelectorSector();
  $("horariosEdicionMarco")?.classList.toggle("oculto", !eq || !puedeEditar());
  $("horariosEditor")?.classList.toggle("oculto", !eq || !edicionActual);
  if (!eq) cerrarEditor();
  if(mio) renderMiHorario();
  if(cfg) renderConfiguracionHorarios();
}
async function cambiarMes(n) { fechaVista = new Date(fechaVista.getFullYear(), fechaVista.getMonth() + n, 1); diaSeleccionado = esMesActual() ? new Date().getDate() : 1; seleccion.clear(); await cargarCalendarioActual(); await cargarResumenHoy(); renderTodo(); }
async function irAHoy() { const h = new Date(); fechaVista = new Date(h.getFullYear(), h.getMonth(), 1); diaSeleccionado = h.getDate(); cambiarVista("equipo"); await cargarCalendarioActual(); await cargarResumenHoy(true); renderTodo(); desplazarAlDia(diaSeleccionado); }
function renderTodo() { if ($("horariosMesTexto")) $("horariosMesTexto").textContent = nombreMes(); renderSelectorSector(); actualizarPanelMes(); actualizarSelectorTurnos(); renderTabla(); renderResumen(); renderMiHorario(); actualizarPermisos(); actualizarAcciones(); }

const COLORES_TURNOS=[['#dc2626','Rojo'],['#f97316','Naranja'],['#f59e0b','Ámbar'],['#eab308','Amarillo'],['#65a30d','Lima'],['#16a34a','Verde'],['#0f766e','Verde azulado'],['#0891b2','Cian'],['#2563eb','Azul'],['#4f46e5','Índigo'],['#7c3aed','Violeta'],['#c026d3','Magenta']];
const MAPA_COLORES_ANTERIORES={
  '#db2777':'#c026d3','#64748b':'#2563eb','#92400e':'#f97316',
  '#111827':'#2563eb','#84cc16':'#65a30d','#14b8a6':'#0f766e'
};
function colorTurnoPermitido(color){
  const c=String(color||'').toLowerCase();
  return COLORES_TURNOS.some(([hex])=>hex===c) ? c : (MAPA_COLORES_ANTERIORES[c] || '#f97316');
}
let turnoConfigEditando=null;
let ordenPersonalInicial=[];
let ordenSectorInicial="";
function mensajeConfig(id,texto,tipo='ok'){const el=$(id);if(!el)return;el.textContent=texto;el.className=`admin-message ${tipo}`;clearTimeout(el._timer);el._timer=setTimeout(()=>{el.textContent='';el.className='admin-message';},3500)}
function nombreColorTurno(hex){return COLORES_TURNOS.find(x=>x[0].toLowerCase()===String(hex).toLowerCase())?.[1]||'Personalizado'}
function contrasteTurno(hex){const n=parseInt(String(hex).replace('#',''),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;return (r*299+g*587+b*114)/1000>150?'#111827':'#fff'}
function renderPaletaTurno(color){const pal=$("horariosTurnoColorPalette");if(!pal)return;$("horariosTurnoColor").value=color;$("horariosTurnoColorNombre").textContent=nombreColorTurno(color);pal.innerHTML=COLORES_TURNOS.map(([hex,n])=>`<button type="button" class="admin-color-option ${hex===color?'seleccionado':''}" data-color="${hex}" aria-label="${n}"><span style="background:${hex}"></span></button>`).join('');pal.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>renderPaletaTurno(b.dataset.color)))}
function actualizarCamposTurnoCortado(){const cortado=$("horariosTurnoCortado")?.checked===true;$("horariosTurnoSegundoTramo")?.classList.toggle('oculto',!cortado);if(!cortado){$("horariosTurnoInicio2").value='';$("horariosTurnoFin2").value=''}}
function abrirTurnoConfig(turno=null){turnoConfigEditando=turno;$("horariosTurnoModalTitulo").textContent=turno?'Editar horario':'Nuevo horario';$("horariosTurnoOriginal").value=turno?.id||'';$("horariosTurnoInicio").value=turno?.inicio||'08:00';$("horariosTurnoFin").value=turno?.fin||'12:00';$("horariosTurnoCortado").checked=turno?.tipo==='cortado';$("horariosTurnoInicio2").value=turno?.inicio2||'16:00';$("horariosTurnoFin2").value=turno?.fin2||'20:00';actualizarCamposTurnoCortado();renderPaletaTurno(colorTurnoPermitido(turno?.color));$("btnHorariosEliminarTurno").classList.toggle('oculto',!turno);$("horariosTurnoModal").classList.remove('oculto');$("horariosTurnoModal").setAttribute('aria-hidden','false')}
function cerrarTurnoConfig(){$("horariosTurnoModal")?.classList.add('oculto');$("horariosTurnoModal")?.setAttribute('aria-hidden','true');turnoConfigEditando=null}
function detalleTurnoConfig(t){return t.tipo==='cortado'?`${t.inicio} - ${t.fin} / ${t.inicio2} - ${t.fin2}`:`${t.inicio} - ${t.fin}`}
function renderListaTurnosConfig(){const cont=$("horariosConfigLista");if(!cont)return;const items=window.AutoservicioHorariosConfig?.cargar?.(sectorActual)||[];cont.innerHTML=items.length?items.map(t=>`<article class="admin-shift-card" data-id="${t.id}"><span class="admin-shift-swatch" style="background:${t.color};color:${contrasteTurno(t.color)}">${t.tipo==='cortado'?'C':t.inicio.slice(0,2)}</span><div class="admin-shift-info"><strong>${detalleTurnoConfig(t)}</strong><span>${t.tipo==='cortado'?'Horario cortado · ':''}${nombreColorTurno(t.color)}</span></div><button type="button">Editar</button></article>`).join(''):'<div class="empty-state">Todavía no hay horarios configurados.</div>';cont.querySelectorAll('[data-id] button').forEach(b=>b.addEventListener('click',()=>abrirTurnoConfig(items.find(t=>t.id===b.closest('[data-id]').dataset.id))))}
async function guardarTurnoConfig(){const inicio=$("horariosTurnoInicio").value,fin=$("horariosTurnoFin").value,color=$("horariosTurnoColor").value,original=$("horariosTurnoOriginal").value,cortado=$("horariosTurnoCortado").checked,inicio2=cortado?$("horariosTurnoInicio2").value:'',fin2=cortado?$("horariosTurnoFin2").value:'';let items=window.AutoservicioHorariosConfig?.cargar?.(sectorActual)||[];if(!inicio||!fin)return mensajeConfig('horariosConfigMensaje','Completá el primer tramo.','error');if(inicio===fin)return mensajeConfig('horariosConfigMensaje','El inicio y el final no pueden ser iguales.','error');if(cortado&&(!inicio2||!fin2))return mensajeConfig('horariosConfigMensaje','Completá el segundo tramo.','error');if(cortado&&inicio2===fin2)return mensajeConfig('horariosConfigMensaje','El segundo tramo no puede comenzar y terminar a la misma hora.','error');if(cortado&&!(inicio<fin&&fin<inicio2&&inicio2<fin2))return mensajeConfig('horariosConfigMensaje','Los tramos deben estar ordenados y separados, por ejemplo 08:00–12:00 y 16:00–20:00.','error');if(!cortado&&inicio>=fin)return mensajeConfig('horariosConfigMensaje','La hora de finalización debe ser posterior al inicio.','error');if(items.some(t=>t.inicio===inicio&&t.fin===fin&&(t.inicio2||'')===inicio2&&(t.fin2||'')===fin2&&t.id!==original))return mensajeConfig('horariosConfigMensaje','Ese horario ya existe.','error');const nuevo={tipo:cortado?'cortado':'continuo',inicio,fin,inicio2,fin2,color};if(original){items=items.map(t=>t.id===original?{...t,...nuevo}:t)}else items.push({id:window.AutoservicioHorariosConfig.idDesdeHoras(inicio,cortado?fin2:fin),...nuevo});try{await window.AutoservicioHorariosConfig.guardar(items,sectorActual);cerrarTurnoConfig();renderListaTurnosConfig();cargarTurnosConfigurados();renderTodo();mensajeConfig('horariosConfigMensaje',original?'Horario actualizado.':'Horario agregado.')}catch(e){mensajeConfig('horariosConfigMensaje',e.message,'error')}}
async function eliminarTurnoConfig(){const id=$("horariosTurnoOriginal").value;let items=window.AutoservicioHorariosConfig?.cargar?.(sectorActual)||[];if(window.HorariosApp?.turnosEnUso?.().includes(id))return mensajeConfig('horariosConfigMensaje','No se puede eliminar porque está asignado en el mes visible.','error');items=items.filter(t=>t.id!==id);if(!items.length)return mensajeConfig('horariosConfigMensaje','Debe quedar al menos un horario.','error');try{await window.AutoservicioHorariosConfig.guardar(items,sectorActual);cerrarTurnoConfig();renderListaTurnosConfig();cargarTurnosConfigurados();renderTodo();mensajeConfig('horariosConfigMensaje','Horario eliminado.')}catch(e){mensajeConfig('horariosConfigMensaje',e.message,'error')}}
function ordenPersonalModificado(){return ordenSectorInicial===sectorActual && JSON.stringify(empleados)!==JSON.stringify(ordenPersonalInicial)}
function actualizarBotonGuardarOrden(){const b=$("btnHorariosGuardarOrden");if(b)b.disabled=!ordenPersonalModificado()}
function prepararOrdenConfig(){if(ordenSectorInicial!==sectorActual){ordenSectorInicial=sectorActual;ordenPersonalInicial=[...empleados]}actualizarBotonGuardarOrden()}
function renderOrdenConfig(){const cont=$("horariosOrdenLista");if(!cont)return;prepararOrdenConfig();cont.innerHTML=empleados.map((e,i)=>`<article class="horarios-order-item" data-empleado="${e.replace(/"/g,'&quot;')}"><span class="horarios-order-index">${i+1}</span><div class="horarios-order-info"><strong>${e}</strong><span>${empleadosInfo.get(e)?.rol==='supervisor'?'Supervisor':'Empleado'}</span></div><div class="horarios-order-actions"><button type="button" data-dir="-1" ${i===0?'disabled':''} aria-label="Subir">↑</button><button type="button" data-dir="1" ${i===empleados.length-1?'disabled':''} aria-label="Bajar">↓</button></div></article>`).join('');cont.querySelectorAll('[data-dir]').forEach(b=>b.addEventListener('click',()=>{const card=b.closest('[data-empleado]'),i=empleados.indexOf(card.dataset.empleado),j=i+Number(b.dataset.dir);if(i<0||j<0||j>=empleados.length)return;[empleados[i],empleados[j]]=[empleados[j],empleados[i]];renderOrdenConfig();actualizarBotonGuardarOrden()}));actualizarBotonGuardarOrden()}
async function guardarOrdenConfig(){if(!ordenPersonalModificado())return;const boton=$("btnHorariosGuardarOrden");if(boton)boton.disabled=true;try{const r=await fetch(`${API_BASE_URL}/horarios/orden`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sector:sectorActual,orden:empleados})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.mensaje||'No se pudo guardar el orden');ordenPersonalInicial=[...empleados];ordenSectorInicial=sectorActual;renderTabla();actualizarBotonGuardarOrden();mensajeConfig('horariosOrdenMensaje','Orden guardado correctamente.')}catch(e){actualizarBotonGuardarOrden();mensajeConfig('horariosOrdenMensaje',e.message,'error')}}
function renderConfiguracionHorarios(){
  const vista=$("horariosConfigView");
  if(!vista)return;
  let bloqueo=$("horariosConfigSinPermiso");
  if(!bloqueo){
    bloqueo=document.createElement("div");
    bloqueo.id="horariosConfigSinPermiso";
    bloqueo.className="tareas-empty horarios-config-sin-permiso";
    bloqueo.innerHTML='<strong>Sin acceso a configuración</strong><span>Esta pantalla está disponible únicamente para supervisores y administradores.</span>';
    vista.prepend(bloqueo);
  }
  const permitido=puedeVerConfiguracion();
  bloqueo.classList.toggle("oculto",permitido);
  vista.querySelectorAll(":scope > .settings-card").forEach(card=>card.classList.toggle("oculto",!permitido));
  if(!permitido)return;
  renderListaTurnosConfig();renderOrdenConfig();
}

function configurarEventos() {
  crearPanelEdicion();
  crearSelectorSector();
  $("btnHorariosMesAnterior")?.addEventListener("click", () => cambiarMes(-1));
  $("btnHorariosMesSiguiente")?.addEventListener("click", () => cambiarMes(1));
  $("btnHorariosHoyToolbar")?.addEventListener("click", irAHoy);
  $("btnCerrarHorariosEditor")?.addEventListener("click", cerrarEditor);
  $("btnCancelarHorario")?.addEventListener("click", cerrarEditor);
  $("btnGuardarHorario")?.addEventListener("click", guardarEdicion);
  document.querySelectorAll("[data-horarios-vista]").forEach(b => b.addEventListener("click", () => cambiarVista(b.dataset.horariosVista)));
  $("btnHorariosNuevoTurno")?.addEventListener("click",()=>abrirTurnoConfig());
  $("btnHorariosGuardarTurno")?.addEventListener("click",guardarTurnoConfig);
  $("horariosTurnoCortado")?.addEventListener("change",actualizarCamposTurnoCortado);
  $("btnHorariosEliminarTurno")?.addEventListener("click",eliminarTurnoConfig);
  $("btnHorariosCancelarTurno")?.addEventListener("click",cerrarTurnoConfig);
  $("btnHorariosGuardarOrden")?.addEventListener("click",guardarOrdenConfig);
  $("horariosTurnoModal")?.addEventListener("click",e=>{if(e.target.id==="horariosTurnoModal")cerrarTurnoConfig()});
  document.addEventListener("keydown", e => { if (e.key === "Escape") { if (edicionActual) cerrarEditor(); else if (modoEdicion) salirModoEdicion(); } });
  window.addEventListener("autoservicio:sesion", () => { actualizarPermisos(); renderMiHorario(); });
}
function activar() {
  restaurarBottomNav = [];
  document.querySelectorAll(".app-bottom-nav:not(.horarios-bottom-nav)").forEach(n => { restaurarBottomNav.push([n, n.style.display]); n.style.display = "none"; });
  renderTodo(); cambiarVista(vistaActual); if (esMesActual()) desplazarAlDia(new Date().getDate(), "auto");
}
function reiniciarModuloHorarios() {
  if (hayCambiosPendientes()) restaurarDatos(estadoInicialEdicion);
  salirModoEdicion(true);
  vistaActual = "equipo";
  seleccion.clear();
  cambiarVista("equipo");
  window.scrollTo({top:0,behavior:"auto"});
}
function desactivar() { reiniciarModuloHorarios(); restaurarBottomNav.forEach(([n, d]) => n.style.display = d); restaurarBottomNav = []; }

configurarEventos();
cargarContextoHorarios();
window.HorariosModule = { activar, desactivar, reiniciar: reiniciarModuloHorarios };



let fechaResumenProgramada = new Date().toDateString();
setInterval(async () => {
  if (document.hidden) return;
  const actual = new Date().toDateString();
  if (actual !== fechaResumenProgramada) {
    fechaResumenProgramada = actual;
    resumenHoyClave = "";
    await cargarResumenHoy(true);
    renderResumen();
  }
}, 60000);

document.addEventListener("visibilitychange", async () => {
  if (document.hidden) return;
  const actual = new Date().toDateString();
  if (actual !== fechaResumenProgramada) {
    fechaResumenProgramada = actual;
    resumenHoyClave = "";
    await cargarResumenHoy(true);
    renderResumen();
  }
});

window.HorariosApp = {
  turnosEnUso() {
    const usados = new Set();
    for (let d = 1; d <= diasDelMes(); d++) empleados.forEach(e => usados.add(obtenerTurno(e, d)));
    return [...usados];
  },
  refrescarTurnos() {
    cargarTurnosConfigurados();
    renderTodo();
  }
};
window.addEventListener('autoservicio:horarios-config', (event) => {
  if (event.detail?.sector && event.detail.sector !== sectorActual) return;
  cargarTurnosConfigurados();
  renderTodo();
});

window.addEventListener("autoservicio:sesion", () => { contextoHorariosCargado = false; cargarContextoHorarios(); });
