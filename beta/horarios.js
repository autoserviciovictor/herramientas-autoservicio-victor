const empleados = ["Mica", "Agustín", "Maxi", "Ariana", "Joaquín", "Bruno"];
const TURNOS = [
  { id: "8-16", label: "8-16", clase: "turno-naranja" },
  { id: "8-13", label: "8-13", clase: "turno-amarillo" },
  { id: "9-14", label: "9-14", clase: "turno-azul" },
  { id: "10-16", label: "10-16", clase: "turno-celeste" },
  { id: "14-22", label: "14-22", clase: "turno-rojo" },
  { id: "16-22", label: "16-22", clase: "turno-violeta" },
  { id: "franco", label: "Franco", clase: "turno-franco" },
  { id: "vacaciones", label: "Vacaciones", clase: "turno-verde" },
  { id: "personalizado", label: "Personalizado", clase: "turno-personalizado" }
];

let fechaVista = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let vistaActual = "equipo";
let diaSeleccionado = new Date().getDate();
let edicionActual = null;
let restaurarBottomNav = [];
let modoPincel = false;
let turnoPincel = "8-16";
let arrastrando = false;
let seleccionInicio = null;
let historial = [];
let estadoInicialEdicion = null;
let pinturaMovimientoActivo = false;
let pinturaCeldas = new Set();
let seleccion = new Set();
let modoEdicion = false;
let portapapelesMes = null;
let portapapelesPersona = null;

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
function obtenerDefinicion(id) { return TURNOS.find(t => t.id === id) || { id, label: id || "—", clase: "turno-personalizado" }; }
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
  seleccion.clear();
  renderTodo();
}
function cancelarTodoCambios() {
  if (!modoEdicion || !hayCambiosPendientes()) return salirModoEdicion(true);
  if (!confirm(`¿Cancelar todos los cambios realizados en esta edición?\n\nEl calendario volverá al estado que tenía al tocar Editar.`)) return;
  restaurarDatos(estadoInicialEdicion);
  historial = [];
  seleccion.clear();
  salirModoEdicion(true);
  renderTodo();
}
function confirmarGuardado() {
  if (!modoEdicion || !hayCambiosPendientes()) return;
  estadoInicialEdicion = clonarDatos();
  historial = [];
  seleccion.clear();
  salirModoEdicion(true);
  renderTodo();
}
function actualizarAcciones() {
  const pendientes = hayCambiosPendientes();
  const acciones = $("horariosCambiosAcciones");
  acciones?.classList.toggle("oculto", !pendientes);
  if ($("horariosUndoOne")) $("horariosUndoOne").disabled = !historial.length;
  if ($("horariosSaveChanges")) $("horariosSaveChanges").disabled = !pendientes;
  if ($("horariosCancelAll")) $("horariosCancelAll").disabled = !pendientes;
  const c = $("horariosSeleccionCount");
  if (c) c.textContent = seleccion.size ? `${seleccion.size} seleccionada${seleccion.size > 1 ? "s" : ""}` : "";
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
function elegirEmpleado(mensaje, sugerido = empleados[0]) {
  const nombre = prompt(`${mensaje}\n\n${empleados.join("\n")}`, sugerido);
  if (nombre === null) return null;
  const limpio = String(nombre).trim().toLowerCase();
  const encontrado = empleados.find(e => e.toLowerCase() === limpio);
  if (!encontrado) {
    alert("No se encontró ese empleado. Escribí el nombre tal como aparece en la lista.");
    return null;
  }
  return encontrado;
}
function capturarMesEmpleado(fecha, empleado) {
  return Array.from({ length: diasDelMes(fecha) }, (_, i) => obtenerTurnoEn(fecha, empleado, i + 1));
}
function turnoCopiadoParaDia(turnos, dia) {
  // Cuando el mes destino tiene más días que el de origen, los días adicionales
  // quedan como franco para que el pegado reemplace el mes completo de forma previsible.
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
  alert(`Se copió ${etiquetaMes(origen)} completo para todo el equipo.`);
}
function pegarMesEquipo() {
  if (!puedeEditar() || !modoEdicion || !portapapelesMes) return;
  const destino = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), 1);
  if (!confirm(`¿Pegar ${etiquetaMes(portapapelesMes.origen)} sobre ${etiquetaMes(destino)}?\n\nSe reemplazarán todos los días de todos los empleados del mes actual.`)) return;
  iniciarMovimiento();
  empleados.forEach(e => {
    const turnos = portapapelesMes.empleados[e] || [];
    for (let d = 1; d <= diasDelMes(destino); d++) {
      datos.set(claveMes(destino, e, d), turnoCopiadoParaDia(turnos, d));
    }
  });
  descartarMovimientoSiNoCambio();
  seleccion.clear();
  renderTodo();
  alert("Mes pegado correctamente.");
}
function copiarMesPersona() {
  if (!puedeEditar() || !modoEdicion) return;
  const empleado = elegirEmpleado("Escribí el nombre de la persona cuyo mes querés copiar:");
  if (!empleado) return;
  const origen = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), 1);
  portapapelesPersona = {
    tipo: "persona",
    origen,
    empleadoOrigen: empleado,
    dias: diasDelMes(origen),
    turnos: capturarMesEmpleado(origen, empleado)
  };
  actualizarPortapapeles();
  alert(`Se copió el mes completo de ${empleado} (${etiquetaMes(origen)}).`);
}
function pegarMesPersona() {
  if (!puedeEditar() || !modoEdicion || !portapapelesPersona) return;
  const empleadoDestino = elegirEmpleado(
    `Escribí el nombre de la persona a la que querés pegar el mes copiado de ${portapapelesPersona.empleadoOrigen}:`,
    portapapelesPersona.empleadoOrigen
  );
  if (!empleadoDestino) return;
  const destino = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), 1);
  if (!confirm(`¿Pegar el mes completo de ${portapapelesPersona.empleadoOrigen} (${etiquetaMes(portapapelesPersona.origen)}) en ${empleadoDestino} para ${etiquetaMes(destino)}?\n\nSe reemplazarán todos los días de ${empleadoDestino} en el mes actual.`)) return;
  iniciarMovimiento();
  for (let d = 1; d <= diasDelMes(destino); d++) {
    datos.set(claveMes(destino, empleadoDestino, d), turnoCopiadoParaDia(portapapelesPersona.turnos, d));
  }
  descartarMovimientoSiNoCambio();
  seleccion.clear();
  renderTodo();
  alert(`Mes de ${empleadoDestino} pegado correctamente.`);
}
function actualizarPortapapeles() {
  const pegarMes = $("btnHorariosPegarMes");
  const pegarPersona = $("btnHorariosPegarPersona");
  if (pegarMes) {
    pegarMes.disabled = !portapapelesMes;
    pegarMes.title = portapapelesMes
      ? `Pegar ${etiquetaMes(portapapelesMes.origen)} para todo el equipo`
      : "Primero copiá un mes completo";
  }
  if (pegarPersona) {
    pegarPersona.disabled = !portapapelesPersona;
    pegarPersona.title = portapapelesPersona
      ? `Pegar el mes copiado de ${portapapelesPersona.empleadoOrigen}`
      : "Primero copiá el mes de una persona";
  }
  const estado = $("horariosCopiaEstado");
  if (estado) {
    const mensajes = [];
    if (portapapelesMes) mensajes.push(`Equipo: ${etiquetaMes(portapapelesMes.origen)}`);
    if (portapapelesPersona) mensajes.push(`${portapapelesPersona.empleadoOrigen}: ${etiquetaMes(portapapelesPersona.origen)}`);
    estado.textContent = mensajes.length ? `Copiado · ${mensajes.join(" · ")}` : "Todavía no hay ningún mes copiado";
    estado.classList.toggle("tiene-copia", mensajes.length > 0);
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
        <button id="btnHorariosCopiarMes" type="button">Copiar mes</button>
        <button id="btnHorariosPegarMes" type="button" disabled title="Primero copiá un mes completo">Pegar mes</button>
        <button id="btnHorariosCopiarPersona" type="button">Copiar mes de una persona</button>
        <button id="btnHorariosPegarPersona" type="button" disabled title="Primero copiá el mes de una persona">Pegar mes de una persona</button>
      </div>
      <small id="horariosCopiaEstado" class="horarios-copia-estado">Todavía no hay ningún mes copiado</small>
      <div class="horarios-pintar-control">
        <button id="horariosPaint" type="button" aria-pressed="false">Pintar</button>
        <label><span>Pintar con</span><select id="horariosPaintTurno">${TURNOS.filter(t => t.id !== "personalizado").map(t => `<option value="${t.id}">${t.label}</option>`).join("")}</select></label>
      </div>
      <div id="horariosCambiosAcciones" class="horarios-cambios-acciones oculto">
        <button id="horariosSaveChanges" type="button" class="primario">Guardar</button>
        <button id="horariosUndoOne" type="button">Deshacer</button>
        <button id="horariosCancelAll" type="button" class="peligro">Cancelar todo</button>
      </div>
      <small id="horariosSeleccionCount" class="horarios-seleccion-count"></small>
    </div>`;
  document.querySelector(".horarios-status-row")?.after(marco);
  $("btnHorariosEditar").onclick = entrarModoEdicion;
  $("btnHorariosCerrarEdicion").onclick = () => salirModoEdicion();
  $("btnHorariosCopiarMes").onclick = copiarMesEquipo;
  $("btnHorariosPegarMes").onclick = pegarMesEquipo;
  $("btnHorariosCopiarPersona").onclick = copiarMesPersona;
  $("btnHorariosPegarPersona").onclick = pegarMesPersona;
  $("horariosPaint").onclick = () => {
    if (!modoEdicion) return;
    modoPincel = !modoPincel;
    $("horariosPaint").classList.toggle("activo", modoPincel);
    $("horariosPaint").setAttribute("aria-pressed", String(modoPincel));
  };
  $("horariosPaintTurno").onchange = e => turnoPincel = e.target.value;
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
  pinturaMovimientoActivo = false;
  pinturaCeldas.clear();
  document.body.classList.add("horarios-modo-edicion");
  $("horariosConsultaAcciones")?.classList.add("oculto");
  $("horariosPanelEdicion")?.classList.remove("oculto");
  $("horariosPanelEdicion")?.setAttribute("aria-hidden", "false");
  actualizarPanelMes();
  actualizarPortapapeles();
  renderTabla();
}
function salirModoEdicion(forzar = false) {
  if (!forzar && hayCambiosPendientes()) {
    if (!confirm("Hay cambios sin guardar. ¿Querés descartarlos y salir del modo edición?")) return false;
    restaurarDatos(estadoInicialEdicion);
  }
  modoEdicion = false;
  modoPincel = false;
  pinturaMovimientoActivo = false;
  pinturaCeldas.clear();
  historial = [];
  estadoInicialEdicion = null;
  seleccion.clear();
  cerrarEditor();
  document.body.classList.remove("horarios-modo-edicion");
  $("horariosPaint")?.classList.remove("activo");
  $("horariosPaint")?.setAttribute("aria-pressed", "false");
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
function seleccionarCelda(e, d, agregar = false) {
  if (!puedeEditar() || !modoEdicion) return;
  if (!agregar) seleccion.clear();
  seleccion.add(keyCelda(e, d));
  renderTabla();
  actualizarAcciones();
}
function seleccionarRango(e2, d2) {
  if (!seleccionInicio || !puedeEditar() || !modoEdicion) return;
  const i1 = empleados.indexOf(seleccionInicio.empleado), i2 = empleados.indexOf(e2), d1 = seleccionInicio.dia;
  seleccion.clear();
  for (let i = Math.min(i1, i2); i <= Math.max(i1, i2); i++) for (let d = Math.min(d1, d2); d <= Math.max(d1, d2); d++) seleccion.add(keyCelda(empleados[i], d));
  renderTabla();
  actualizarAcciones();
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
    return `<td class="${esHoy(d) ? "dia-hoy" : ""} ${d === diaSeleccionado ? "dia-seleccionado" : ""} ${sel ? "celda-seleccionada" : ""}" data-empleado="${e}" data-dia="${d}"><button type="button" class="horario-cell ${t.clase}" data-tooltip="${t.label}">${formatoCelda(id)}</button></td>`;
  }).join("")}</tr>`).join("");
  head.querySelectorAll("[data-horarios-dia]").forEach(x => x.onclick = () => { diaSeleccionado = Number(x.dataset.horariosDia); renderTabla(); renderResumen(); });
  body.querySelectorAll("td[data-empleado]").forEach(td => {
    td.onpointerdown = e => {
      if (!puedeEditar() || !modoEdicion) return;
      e.preventDefault();
      const emp = td.dataset.empleado, d = Number(td.dataset.dia);
      if (modoPincel) {
        pinturaMovimientoActivo = true;
        pinturaCeldas.clear();
        iniciarMovimiento();
        pintarCelda(td, emp, d);
        return;
      }
      arrastrando = true; seleccionInicio = { empleado: emp, dia: d }; seleccionarCelda(emp, d, e.ctrlKey || e.metaKey);
    };
    td.onpointerenter = () => {
      if (pinturaMovimientoActivo && modoPincel) pintarCelda(td, td.dataset.empleado, Number(td.dataset.dia));
      else if (arrastrando) seleccionarRango(td.dataset.empleado, Number(td.dataset.dia));
    };
    td.ondblclick = () => { if (puedeEditar() && modoEdicion && !modoPincel) abrirEditor(td.dataset.empleado, Number(td.dataset.dia)); };
  });
  const w = document.querySelector("#horariosEquipoView .horarios-table-wrap");
  if (w && !w.dataset.cfg) { w.dataset.cfg = "1"; w.addEventListener("scroll", actualizarColumnaEmpleados, { passive: true }); }
  actualizarColumnaEmpleados();
}
function pintarCelda(td, empleado, dia) {
  const k = keyCelda(empleado, dia);
  if (pinturaCeldas.has(k)) return;
  pinturaCeldas.add(k);
  datos.set(clave(empleado, dia), turnoPincel);
  const btn = td.querySelector(".horario-cell");
  const def = obtenerDefinicion(turnoPincel);
  if (btn) {
    btn.className = `horario-cell ${def.clase}`;
    btn.dataset.tooltip = def.label;
    btn.innerHTML = formatoCelda(turnoPincel);
  }
  actualizarAcciones();
}
document.addEventListener("pointerup", () => {
  arrastrando = false;
  if (pinturaMovimientoActivo) {
    pinturaMovimientoActivo = false;
    descartarMovimientoSiNoCambio();
    pinturaCeldas.clear();
    renderTodo();
  }
});

function renderResumen() {
  const t = $("horariosDiaSeleccionado"), c = $("horariosResumenDia");
  if (!t || !c) return;
  const f = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), diaSeleccionado);
  t.textContent = f.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const m = new Map();
  empleados.forEach(e => { const id = obtenerTurno(e, diaSeleccionado); m.set(id, (m.get(id) || 0) + 1); });
  c.innerHTML = [...m].map(([id, n]) => { const x = obtenerDefinicion(id); return `<div><span><i class="${x.clase}"></i>${x.label}</span><strong>${n} ${n === 1 ? "persona" : "personas"}</strong></div>`; }).join("");
  const cv = coberturaDia(diaSeleccionado), b = $("horariosCoberturaEstado");
  if (b) { b.textContent = `Mañana ${cv.manana} · Tarde ${cv.tarde}`; b.classList.toggle("alerta", cv.manana < 2 || cv.tarde < 2); }
}
function abrirEditor(e, d) {
  if (!puedeEditar() || !modoEdicion) return;
  edicionActual = { empleado: e, dia: d, turno: obtenerTurno(e, d) };
  $("horariosEditorEmpleado").textContent = seleccion.size > 1 ? `${seleccion.size} turnos` : e;
  $("horariosEditorFecha").textContent = seleccion.size > 1 ? "Aplicar a la selección" : new Date(fechaVista.getFullYear(), fechaVista.getMonth(), d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const o = $("horariosTurnosOpciones");
  o.innerHTML = TURNOS.map(t => `<button type="button" class="horarios-turno-option ${t.clase} ${t.id === edicionActual.turno ? "seleccionado" : ""}" data-turno="${t.id}"><span></span><strong>${t.label}</strong></button>`).join("");
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
  lista.innerHTML = dias.map(d => { const id = obtenerTurno(e, d), tr = obtenerDefinicion(id), f = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), d); return `<article><div><span>${f.toLocaleDateString("es-AR", { weekday: "long" })}</span><strong>${d} de ${f.toLocaleDateString("es-AR", { month: "long" })}</strong></div><span class="mi-turno-pill ${tr.clase}">${formatoAmPm(id)}</span></article>`; }).join("");
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
