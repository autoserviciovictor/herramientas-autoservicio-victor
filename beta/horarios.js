const empleados = ["Mica", "Agustín", "Maxi", "Ariana", "Joaquín", "Bruno"];
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
    { id: 'vacaciones', label: 'Vacaciones', clase: 'turno-verde', estilo: '' }
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
  return `${fecha.getFullYear()}-${fecha.getMonth()}-${dia}-${empleado}`;
}
function clave(empleado, dia) { return claveMes(fechaVista, empleado, dia); }
function turnoEjemplo(i, d) {
  const s = [
    ["8-16","8-16","franco","16-22","16-22","8-13","franco"],
    ["8-13","8-13","8-16","franco","16-22","16-22","franco"],
    ["16-22","16-22","franco","8-16","8-16","14-22","franco"],
    ["14-22","14-22","8-16","8-16","franco","16-22","franco"],
    ["9-14","9-14","vacaciones","vacaciones","vacaciones","franco","franco"],
    ["10-16","10-16","franco","14-22","14-22","8-16","franco"]
  ];
  return s[i][(d - 1) % 7];
}
function obtenerTurnoEn(fecha, e, d) { return datos.get(claveMes(fecha, e, d)) || turnoEjemplo(empleados.indexOf(e), d); }
function obtenerTurno(e, d) { return obtenerTurnoEn(fechaVista, e, d); }
function obtenerDefinicion(id) { return TURNOS.find(t => t.id === id) || { id, label: id || '—', clase: 'turno-personalizado', estilo: '' }; }
function diasDelMes(fecha = fechaVista) { return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate(); }
function nombreMes() { return fechaVista.toLocaleDateString("es-AR", { month: "long", year: "numeric" }); }
function nombreDia(d) { return new Date(fechaVista.getFullYear(), fechaVista.getMonth(), d).toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "").toUpperCase(); }
function esMesActual() { const h = new Date(); return fechaVista.getFullYear() === h.getFullYear() && fechaVista.getMonth() === h.getMonth(); }
function esHoy(d) { return esMesActual() && d === new Date().getDate(); }
function puedeEditar() { const rol = window.AutoservicioAuth?.getUsuario?.()?.rol; return rol === "administrador" || rol === "supervisor"; }

function parsearTurno(id) {
  const m = String(id || "").match(/^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  return { inicioH: Number(m[1]), inicioM: Number(m[2] || 0), finH: Number(m[3]), finM: Number(m[4] || 0) };
}
function hora24(h, m = 0) { return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
function formatoCelda(id) {
  if (id === "franco") return "F";
  if (id === "vacaciones") return "V";
  const p = parsearTurno(id);
  return p ? `<span>${hora24(p.inicioH, p.inicioM)}</span><span>${hora24(p.finH, p.finM)}</span>` : id;
}
function horaAmPm(h, m = 0) {
  const sufijo = h >= 12 ? "PM" : "AM";
  const hora = h % 12 || 12;
  return `${String(hora).padStart(2, "0")}:${String(m).padStart(2, "0")} ${sufijo}`;
}
function formatoAmPm(id) {
  if (id === "franco") return "Franco";
  if (id === "vacaciones") return "Vacaciones";
  const p = parsearTurno(id);
  return p ? `${horaAmPm(p.inicioH, p.inicioM)} - ${horaAmPm(p.finH, p.finM)}` : id;
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
  return !!(modoEdicion && estadoInicialEdicion && !mapasIguales(datos, estadoInicialEdicion));
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
function confirmarGuardado() {
  if (!modoEdicion || !hayCambiosPendientes()) return;
  estadoInicialEdicion = clonarDatos();
  historial = [];
  seleccion.clear();
  salirModoEdicion(true);
  renderTodo();
  avisoHorarios("Cambios guardados");
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
    for (let d = Math.min(d1, d2); d <= Math.max(d1, d2); d++) seleccion.add(keyCelda(empleados[i], d));
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
  body.innerHTML = empleados.map(e => `<tr><th class="empleado-col"><span class="empleado-avatar">${e[0]}</span><strong>${e}</strong></th>${Array.from({ length: diasDelMes() }, (_, i) => {
    const d = i + 1, id = obtenerTurno(e, d), t = obtenerDefinicion(id), sel = seleccion.has(keyCelda(e, d));
    return `<td class="${esHoy(d) ? "dia-hoy" : ""} ${d === diaSeleccionado ? "dia-seleccionado" : ""} ${sel ? "celda-seleccionada" : ""}" data-empleado="${e}" data-dia="${d}"><button type="button" class="horario-cell ${t.clase}" style="${t.estilo || ''}" data-tooltip="${t.label}">${formatoCelda(id)}</button></td>`;
  }).join("")}</tr>`).join("");
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
    td.ondblclick = () => { if (puedeEditar() && modoEdicion) abrirEditor(td.dataset.empleado, Number(td.dataset.dia)); };
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
  const f = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), diaSeleccionado);
  t.textContent = f.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const m = new Map();
  empleados.forEach(e => { const id = obtenerTurno(e, diaSeleccionado); m.set(id, (m.get(id) || 0) + 1); });
  c.innerHTML = [...m].map(([id, n]) => { const x = obtenerDefinicion(id); return `<div><span><i class="${x.clase}" style="${x.estilo || ''}"></i>${x.label}</span><strong>${n} ${n === 1 ? "persona" : "personas"}</strong></div>`; }).join("");
  const cv = coberturaDia(diaSeleccionado), b = $("horariosCoberturaEstado");
  if (b) { b.textContent = `Mañana ${cv.manana} · Tarde ${cv.tarde}`; b.classList.toggle("alerta", cv.manana < 2 || cv.tarde < 2); }
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
  });
  $("horariosCustomWrap").classList.toggle("oculto", edicionActual.turno !== "personalizado" && TURNOS.some(t => t.id === edicionActual.turno));
  $("horariosTurnoPersonalizado").value = TURNOS.some(t => t.id === edicionActual.turno) ? "" : edicionActual.turno;
  $("horariosEditor").classList.remove("oculto");
  $("horariosEditor").setAttribute("aria-hidden", "false");
}
function cerrarEditor() { $("horariosEditor")?.classList.add("oculto"); $("horariosEditor")?.setAttribute("aria-hidden", "true"); edicionActual = null; }
function guardarEdicion() {
  if (!edicionActual || !puedeEditar() || !modoEdicion) return;
  let turno = edicionActual.turno;
  if (turno === "personalizado") { turno = $("horariosTurnoPersonalizado").value.trim(); if (!parsearTurno(turno)) return $("horariosTurnoPersonalizado").focus(); }
  if (seleccion.size > 1) aplicarTurnoASeleccion(turno);
  else {
    iniciarMovimiento();
    datos.set(clave(edicionActual.empleado, edicionActual.dia), turno);
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
  const e = empleados.find(x => x.toLowerCase() === String(usuario?.nombre || "").toLowerCase()) || "Agustín";
  const lista = $("miHorarioLista"); if (!lista) return;
  const inicio = esMesActual() ? new Date().getDate() : 1;
  const dias = Array.from({ length: Math.min(10, diasDelMes() - inicio + 1) }, (_, i) => inicio + i);
  let horas = 0, francos = 0, vac = 0;
  for (let d = 1; d <= diasDelMes(); d++) {
    const id = obtenerTurno(e, d), p = parsearTurno(id);
    if (id === "franco") francos++; else if (id === "vacaciones") vac++; else if (p) horas += (p.finH + p.finM / 60) - (p.inicioH + p.inicioM / 60);
  }
  let stats = $("miHorarioStats");
  if (!stats) { stats = document.createElement("section"); stats.id = "miHorarioStats"; stats.className = "mi-horario-stats"; lista.before(stats); }
  stats.innerHTML = `<article><strong>${horas}</strong><span>Horas del mes</span></article><article><strong>${francos}</strong><span>Francos</span></article><article><strong>${vac}</strong><span>Vacaciones</span></article>`;
  lista.innerHTML = dias.map(d => { const id = obtenerTurno(e, d), tr = obtenerDefinicion(id), f = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), d); return `<article><div><span>${f.toLocaleDateString("es-AR", { weekday: "long" })}</span><strong>${d} de ${f.toLocaleDateString("es-AR", { month: "long" })}</strong></div><span class="mi-turno-pill ${tr.clase}" style="${tr.estilo || ''}">${formatoAmPm(id)}</span></article>`; }).join("");
  const proximo = encontrarProximoTurno(e);
  $("miHorarioProximo").textContent = proximo ? formatoAmPm(proximo.id) : "Sin turnos próximos";
  $("miHorarioProximoFecha").textContent = proximo ? proximo.fecha.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }) : "—";
  const saludo = document.querySelector(".mi-horario-saludo"); if (saludo) saludo.textContent = `Hola, ${usuario?.nombre || e}`;
}
function cambiarVista(v) {
  vistaActual = v;
  const eq = v === "equipo";
  $("horariosEquipoView")?.classList.toggle("oculto", !eq);
  $("horariosMioView")?.classList.toggle("oculto", eq);
  $("horariosTituloVista").textContent = eq ? "Calendario" : "Mi horario";
  $("horariosSubtituloVista").textContent = eq ? "Vista mensual de todos los empleados" : "Tus próximos turnos, francos y vacaciones";
  document.querySelectorAll("[data-horarios-vista]").forEach(b => b.classList.toggle("activo", b.dataset.horariosVista === v));
  $("horariosEdicionMarco")?.classList.toggle("oculto", !eq || !puedeEditar());
  $("horariosEditor")?.classList.toggle("oculto", !eq || !edicionActual);
  if (!eq) { cerrarEditor(); renderMiHorario(); }
}
function cambiarMes(n) { fechaVista = new Date(fechaVista.getFullYear(), fechaVista.getMonth() + n, 1); diaSeleccionado = esMesActual() ? new Date().getDate() : 1; seleccion.clear(); renderTodo(); }
function irAHoy() { const h = new Date(); fechaVista = new Date(h.getFullYear(), h.getMonth(), 1); diaSeleccionado = h.getDate(); cambiarVista("equipo"); renderTodo(); desplazarAlDia(diaSeleccionado); }
function renderTodo() { if ($("horariosMesTexto")) $("horariosMesTexto").textContent = nombreMes(); actualizarPanelMes(); renderTabla(); renderResumen(); renderMiHorario(); actualizarPermisos(); actualizarAcciones(); actualizarPortapapeles(); }
function configurarEventos() {
  crearPanelEdicion();
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
window.HorariosModule = { activar, desactivar };


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
window.addEventListener('autoservicio:horarios-config', () => {
  cargarTurnosConfigurados();
  renderTodo();
});
