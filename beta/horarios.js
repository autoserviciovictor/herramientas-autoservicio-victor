import { API_BASE_URL } from "./config.js?v=82-entrega6";

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

function usuarioHorarios() { return window.AutoservicioAuth?.getUsuario?.() || {}; }
function rolHorarios() { return String(usuarioHorarios().rol || "").trim().toLowerCase(); }
function esAdministradorHorarios() { return rolHorarios() === "administrador"; }
function sectorSeleccionado() { return sectoresHorarios.find(s => s.id === sectorActual) || null; }
function empleadosDelSector(id = sectorActual) {
  const sector = sectoresHorarios.find(s => s.id === id);
  empleadosInfo = new Map((sector?.empleadosInfo || []).map(x=>[x.nombre,x]));
  return Array.isArray(sector?.empleados) ? sector.empleados : [];
}
function puedeEditarEmpleado(nombre){ const rol=rolHorarios(); const info=empleadosInfo.get(nombre)||{}; if(rol==="administrador") return true; if(rol==="administracion") return info.rol==="supervisor"; if(rol==="supervisor") return info.rol!=="supervisor" && info.usuario!==usuarioHorarios().usuario; return false; }
async function cargarContextoHorarios() {
  try {
    const r = await fetch(`${API_BASE_URL}/horarios/contexto`);
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.mensaje || "No se pudieron cargar los sectores");
    sectoresHorarios = (data.sectores || []).filter(s => s.activo !== false);
    permisoEdicionServidor = data.puedeEditar === true;
    const usuario = usuarioHorarios();
    const puedeElegirSector = ["administrador","administracion","supervisor"].includes(String(usuario.rol || "").trim().toLowerCase());
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
    sectoresHorarios = [];
    permisoEdicionServidor = false;
    sectorActual = "";
    empleados = [];
    contextoHorariosCargado = true;
    renderSelectorSector();
    renderTodo();
    avisoHorarios(error.message || "No se pudo acceder a Horarios.", "error");
  }
}
function crearSelectorSector() {
  if ($("horariosSectorBar")) return;
  const bar = document.createElement("section");
  bar.id = "horariosSectorBar";
  bar.className = "horarios-sector-bar";
  bar.innerHTML = `
    <div class="horarios-sector-identidad"><i id="horariosSectorColor"></i><div><span>Sector</span><strong id="horariosSectorNombre">—</strong></div></div>
    <label id="horariosSectorSelectorWrap" class="horarios-sector-selector oculto"><span>Cambiar sector</span><select id="horariosSectorSelector"></select></label>`;
  document.querySelector(".horarios-toolbar")?.after(bar);
  $("horariosSectorSelector").addEventListener("change", async e => {
    if (modoEdicion) {
      const salio = await salirModoEdicion();
      if (!salio) { e.target.value = sectorActual; return; }
    }
    sectorActual = e.target.value;
    empleados = empleadosDelSector();
    seleccion.clear();
    portapapelesMes = null;
    diaSeleccionado = Math.min(diaSeleccionado, diasDelMes());
    await window.AutoservicioHorariosConfig?.cargarRemoto?.(sectorActual);
    cargarTurnosConfigurados();
    await cargarCalendarioActual();
    await cargarResumenHoy(true);
    renderSelectorSector();
    renderTodo();
    desplazarAlDia(esMesActual() ? new Date().getDate() : 1, "auto");
  });
}
function renderSelectorSector() {
  crearSelectorSector();
  const sector = sectorSeleccionado();
  if ($("horariosSectorNombre")) $("horariosSectorNombre").textContent = sector?.nombre || "Sin sector";
  if ($("horariosSectorColor")) $("horariosSectorColor").style.background = sector?.color || "#b72e35";
  const wrap = $("horariosSectorSelectorWrap");
  const select = $("horariosSectorSelector");
  if (wrap) wrap.classList.toggle("oculto", vistaActual !== "equipo" || !["administrador","administracion","supervisor"].includes(rolHorarios()) || sectoresHorarios.length < 2);
  if (select) {
    select.innerHTML = sectoresHorarios.map(s => `<option value="${s.id}">${s.nombre}</option>`).join("");
    select.value = sectorActual;
  }
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
    label: `${t.inicio} - ${t.fin}`,
    clase: 'turno-configurable',
    estilo: `--turno-color:${t.color};--turno-fondo:${t.color}22;--turno-borde:${t.color}66`
  })).concat([
    { id: 'franco', label: 'Franco', clase: 'turno-franco', estilo: '' },
    { id: 'vacaciones', label: 'Vacaciones', clase: 'turno-verde', estilo: '' },
    { id: 'ausente', label: 'Ausente', clase: 'turno-ausente', estilo: '' },
    { id: 'licencia', label: 'Licencia', clase: 'turno-licencia', estilo: '' }
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
let portapapelesMes = null;

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
      const r = await fetch(`${API_BASE_URL}/horarios/calendario?sector=${encodeURIComponent(sectorActual)}&mes=${mesHoy}`);
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.mensaje || "No se pudo cargar el resumen de hoy");
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
async function cargarCalendarioActual() {
  if (!sectorActual) return;
  limpiarMesDatos();
  try {
    const r = await fetch(`${API_BASE_URL}/horarios/calendario?sector=${encodeURIComponent(sectorActual)}&mes=${mesClave()}`);
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.mensaje || "No se pudo cargar el calendario");
    (data.celdas || []).forEach(c => datos.set(clave(String(c.empleado), Number(c.dia)), String(c.turno)));
    detalles.clear();
    (data.detalles || []).forEach(x => detalles.set(keyCelda(String(x.empleado), Number(x.dia)), { tipo:x.tipo || "", motivo:x.motivo || "", observacion:x.observacion || "" }));
    metadatosModificados = false;
    if (Array.isArray(data.turnos) && data.turnos.length) {
      window.AutoservicioHorariosConfig?.guardarLocal?.(data.turnos, sectorActual);
      cargarTurnosConfigurados();
    }
  } catch (error) {
    avisoHorarios(error.message || "No se pudo cargar el calendario", "error");
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

function parsearTurno(id) {
  const m = String(id || "").match(/^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  return { inicioH: Number(m[1]), inicioM: Number(m[2] || 0), finH: Number(m[3]), finM: Number(m[4] || 0) };
}
function hora24(h, m = 0) { return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
function formatoCelda(id) {
  if (!id) return "—";
  if (id === "franco") return "F";
  if (id === "vacaciones") return "V";
  if (id === "ausente") return "A";
  if (id === "licencia") return "L";
  const p = parsearTurno(id);
  return p ? `<span>${hora24(p.inicioH, p.inicioM)}</span><span>${hora24(p.finH, p.finM)}</span>` : id;
}
function formatoHorario24(id) {
  if (!id) return "Sin asignar";
  if (id === "franco") return "Franco";
  if (id === "vacaciones") return "Vacaciones";
  if (id === "ausente") return "Ausente";
  if (id === "licencia") return "Licencia";
  const p = parsearTurno(id);
  return p ? `${hora24(p.inicioH, p.inicioM)} - ${hora24(p.finH, p.finM)}` : id;
}
function coberturaDia(d) {
  let manana = 0, tarde = 0;
  empleados.forEach(e => {
    const id = obtenerTurno(e, d), p = parsearTurno(id);
    if (!p) return;
    if (p.inicioH < 14) manana++;
    if (p.finH > 14) tarde++;
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
function capturarMesEmpleado(fecha, empleado) {
  return Array.from({ length: diasDelMes(fecha) }, (_, i) => obtenerTurnoEn(fecha, empleado, i + 1));
}
function turnoCopiadoParaDia(turnos, dia) {
  return turnos[dia - 1] ?? "franco";
}
function copiarMesEquipo() {
  if (!puedeEditar() || !modoEdicion) return;
  const origen = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), 1);
  portapapelesMes = {
    tipo: "equipo",
    origen,
    dias: diasDelMes(origen),
    sector: sectorActual,
    empleados: Object.fromEntries(empleados.map(e => [e, capturarMesEmpleado(origen, e)]))
  };
  actualizarPortapapeles();
  avisoHorarios(`Se copió ${etiquetaMes(origen)} completo`);
}
async function pegarMesEquipo() {
  if (!puedeEditar() || !modoEdicion || !portapapelesMes) return;
  const destino = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), 1);
  const ok = await dialogoHorarios({
    titulo: "Pegar mes completo",
    mensaje: `Se reemplazarán todos los horarios de ${etiquetaMes(destino)} con la copia de ${etiquetaMes(portapapelesMes.origen)}.`,
    confirmar: "Pegar mes"
  });
  if (!ok) return;
  iniciarMovimiento();
  empleados.forEach(e => {
    const turnos = portapapelesMes.empleados[e] || [];
    for (let d = 1; d <= diasDelMes(destino); d++) {
      datos.set(claveMes(destino, e, d), turnoCopiadoParaDia(turnos, d));
    }
  });
  descartarMovimientoSiNoCambio();
  seleccion.clear();
  portapapelesMes = null;
  renderTodo();
  actualizarPortapapeles();
  avisoHorarios("Mes pegado correctamente");
}
function ejecutarCopiarPegarMes() {
  return portapapelesMes ? pegarMesEquipo() : copiarMesEquipo();
}
function actualizarPortapapeles() {
  const boton = $("btnHorariosCopiarPegarMes");
  if (boton) {
    boton.textContent = portapapelesMes ? "Pegar mes" : "Copiar mes";
    boton.classList.toggle("listo-para-pegar", !!portapapelesMes);
    boton.title = portapapelesMes
      ? `Pegar ${etiquetaMes(portapapelesMes.origen)} sobre el mes visible`
      : "Copiar el mes completo del equipo";
  }
  const estado = $("horariosCopiaEstado");
  if (estado) {
    estado.textContent = portapapelesMes
      ? `Mes copiado: ${etiquetaMes(portapapelesMes.origen)} · disponible para pegar una vez`
      : "La copia se habilita para un único pegado";
    estado.classList.toggle("tiene-copia", !!portapapelesMes);
  }
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
      <div class="horarios-panel-tools">
        <button id="btnHorariosCopiarPegarMes" type="button">Copiar mes</button>
      </div>
      <small id="horariosCopiaEstado" class="horarios-copia-estado">La copia se habilita para un único pegado</small>
      <div class="horarios-pintar-control">
        <label><span>Pintar con</span><select id="horariosPaintTurno">${TURNOS.filter(t => t.id !== "personalizado").map(t => `<option value="${t.id}">${t.label}</option>`).join("")}</select></label>
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
  $("btnHorariosEditar").onclick = entrarModoEdicion;
  $("btnHorariosCerrarEdicion").onclick = () => salirModoEdicion();
  $("btnHorariosCopiarPegarMes").onclick = ejecutarCopiarPegarMes;
  $("horariosPaint").onclick = () => aplicarTurnoASeleccion(turnoPincel);
  $("horariosPaintTurno").onchange = e => turnoPincel = e.target.value;
  $("horariosClearSelection").onclick = () => {
    seleccion.clear();
    renderTabla();
    actualizarAcciones();
  };
  $("horariosSaveChanges").onclick = confirmarGuardado;
  $("horariosUndoOne").onclick = deshacerUltimo;
  $("horariosCancelAll").onclick = cancelarTodoCambios;
  actualizarPermisos();
  actualizarAcciones();
  actualizarPortapapeles();
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
  actualizarPortapapeles();
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
  body.innerHTML = empleados.length ? empleados.map(e => `<tr><th class="empleado-col"><span class="empleado-avatar">${e[0]}</span><strong>${e}</strong></th>${Array.from({ length: diasDelMes() }, (_, i) => {
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
  if (distancia < 6) return;
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
  let manana = 0, tarde = 0;
  empleados.forEach(e => {
    const p = parsearTurno(resumenHoyDatos.get(claveResumenHoy(e)) || "");
    if (!p) return;
    const inicio = p.inicioH + p.inicioM / 60, fin = p.finH + p.finM / 60;
    if (inicio < 14 && fin > 8) manana++;
    if (inicio < 22 && fin > 14) tarde++;
  });
  const b = $("horariosCoberturaEstado");
  if (b) { b.textContent = `Mañana ${manana} · Tarde ${tarde}`; b.classList.toggle("alerta", manana < 2 || tarde < 2); }
  renderEstadisticasSector();
}
function renderEstadisticasSector(){
  const box=$("horariosEstadisticas"); if(!box) return;
  let horas=0,francos=0,vacaciones=0,licencias=0,ausencias=0;
  empleados.forEach(e=>{for(let d=1;d<=diasDelMes();d++){const id=obtenerTurno(e,d),p=parsearTurno(id);if(p)horas+=(p.finH+p.finM/60)-(p.inicioH+p.inicioM/60);else if(id==="franco")francos++;else if(id==="vacaciones")vacaciones++;else if(id==="licencia")licencias++;else if(id==="ausente")ausencias++;}});
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
    const id = obtenerTurnoEn(mes, empleado, dia), p = parsearTurno(id);
    if (!p) continue;
    const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), p.inicioH, p.inicioM);
    if (inicio > ahora) return { fecha, id };
  }
  return null;
}
function renderMiHorario() {
  const usuario = window.AutoservicioAuth?.getUsuario?.();
  const e = empleados.find(x => x.toLowerCase() === String(usuario?.nombre || "").toLowerCase()) || empleados[0] || String(usuario?.nombre || "");
  const lista = $("miHorarioLista"); if (!lista) return;
  const inicio = esMesActual() ? new Date().getDate() : 1;
  const dias = Array.from({ length: Math.min(10, diasDelMes() - inicio + 1) }, (_, i) => inicio + i);
  $("miHorarioStats")?.remove();
  lista.innerHTML = dias.map(d => { const id = obtenerTurno(e, d), tr = obtenerDefinicion(id), f = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), d); return `<article><div><span>${f.toLocaleDateString("es-AR", { weekday: "long" })}</span><strong>${d} de ${f.toLocaleDateString("es-AR", { month: "long" })}</strong></div><span class="mi-turno-pill ${tr.clase}" style="${tr.estilo || ''}">${formatoHorario24(id)}</span></article>`; }).join("");
  const proximo = encontrarProximoTurno(e);
  $("miHorarioProximo").textContent = proximo ? formatoHorario24(proximo.id) : "Sin turnos próximos";
  $("miHorarioProximoFecha").textContent = proximo ? proximo.fecha.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }) : "—";
  const saludo = document.querySelector(".mi-horario-saludo"); if (saludo) saludo.textContent = `Hola, ${usuario?.nombre || e}`;
}


function cambiarVista(v) {
  vistaActual = v;
  const eq = v === "equipo";
  $("horariosEquipoView")?.classList.toggle("oculto", !eq);
  $("horariosMioView")?.classList.toggle("oculto", eq);
  $("horariosTituloVista").textContent = eq ? "Calendario" : "Mi horario";
  renderSelectorSector();
  document.querySelectorAll("[data-horarios-vista]").forEach(b => b.classList.toggle("activo", b.dataset.horariosVista === v));
  $("horariosEdicionMarco")?.classList.toggle("oculto", !eq || !puedeEditar());
  $("horariosEditor")?.classList.toggle("oculto", !eq || !edicionActual);
  if (!eq) { cerrarEditor(); renderMiHorario(); }
}
async function cambiarMes(n) { fechaVista = new Date(fechaVista.getFullYear(), fechaVista.getMonth() + n, 1); diaSeleccionado = esMesActual() ? new Date().getDate() : 1; seleccion.clear(); await cargarCalendarioActual(); await cargarResumenHoy(); renderTodo(); }
async function irAHoy() { const h = new Date(); fechaVista = new Date(h.getFullYear(), h.getMonth(), 1); diaSeleccionado = h.getDate(); cambiarVista("equipo"); await cargarCalendarioActual(); await cargarResumenHoy(true); renderTodo(); desplazarAlDia(diaSeleccionado); }
function renderTodo() { if ($("horariosMesTexto")) $("horariosMesTexto").textContent = nombreMes(); renderSelectorSector(); actualizarPanelMes(); renderTabla(); renderResumen(); renderMiHorario(); actualizarPermisos(); actualizarAcciones(); actualizarPortapapeles(); }
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
  document.addEventListener("keydown", e => { if (e.key === "Escape") { if (edicionActual) cerrarEditor(); else if (modoEdicion) salirModoEdicion(); } });
  window.addEventListener("autoservicio:sesion", () => { actualizarPermisos(); renderMiHorario(); });
}
function activar() {
  restaurarBottomNav = [];
  document.querySelectorAll(".app-bottom-nav:not(.horarios-bottom-nav)").forEach(n => { restaurarBottomNav.push([n, n.style.display]); n.style.display = "none"; });
  renderTodo(); cambiarVista(vistaActual); if (esMesActual()) desplazarAlDia(new Date().getDate(), "auto");
}
function desactivar() { if (hayCambiosPendientes()) restaurarDatos(estadoInicialEdicion); salirModoEdicion(true); restaurarBottomNav.forEach(([n, d]) => n.style.display = d); restaurarBottomNav = []; }

configurarEventos();
cargarContextoHorarios();
window.HorariosModule = { activar, desactivar };



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
