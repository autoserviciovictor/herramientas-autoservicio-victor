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
let seleccion = new Set();

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

function guardarEstado() { historial.push(new Map(datos)); if (historial.length > 40) historial.shift(); actualizarAcciones(); }
function deshacerTodo() {
  if (!historial.length) return;
  const primero = historial[0];
  datos.clear();
  primero.forEach((v, k) => datos.set(k, v));
  historial = [];
  seleccion.clear();
  renderTodo();
}
function confirmarGuardado() {
  historial = [];
  seleccion.clear();
  const btn = $("horariosSaveAll");
  if (btn) { btn.textContent = "Guardado"; btn.classList.add("guardado"); setTimeout(() => { btn.textContent = "Guardar"; btn.classList.remove("guardado"); }, 1200); }
  renderTodo();
}
function actualizarAcciones() {
  if ($("horariosUndoAll")) $("horariosUndoAll").disabled = !historial.length;
  if ($("horariosSaveAll")) $("horariosSaveAll").disabled = !historial.length;
  const c = $("horariosSeleccionCount");
  if (c) c.textContent = seleccion.size ? `${seleccion.size} seleccionada${seleccion.size > 1 ? "s" : ""}` : "";
}
function aplicarTurnoASeleccion(turno) {
  if (!seleccion.size || !puedeEditar()) return;
  guardarEstado();
  seleccion.forEach(k => { const [e, d] = k.split("::"); datos.set(clave(e, Number(d)), turno); });
  renderTodo();
}

function copiarMesCompleto() {
  if (!puedeEditar()) return;
  const modo = prompt("Escribí 1 para copiar un empleado o 2 para copiar todo el equipo:", "2");
  if (modo !== "1" && modo !== "2") return;
  let lista = empleados;
  if (modo === "1") {
    const nombre = prompt(`¿Qué empleado querés copiar?\n${empleados.join(", ")}`, empleados[0]);
    const encontrado = empleados.find(e => e.toLowerCase() === String(nombre || "").trim().toLowerCase());
    if (!encontrado) return alert("No se encontró ese empleado.");
    lista = [encontrado];
  }
  const destino = new Date(fechaVista.getFullYear(), fechaVista.getMonth() + 1, 1);
  const detalle = modo === "1" ? lista[0] : "todo el equipo";
  if (!confirm(`Se copiarán los horarios de ${detalle} de ${nombreMes()} a ${destino.toLocaleDateString("es-AR", { month: "long", year: "numeric" })}.\n\nLos horarios existentes del mes destino serán reemplazados. ¿Continuar?`)) return;
  guardarEstado();
  lista.forEach(e => {
    for (let d = 1; d <= diasDelMes(destino); d++) {
      const origenDia = Math.min(d, diasDelMes(fechaVista));
      datos.set(claveMes(destino, e, d), obtenerTurnoEn(fechaVista, e, origenDia));
    }
  });
  alert("Mes copiado correctamente.");
  actualizarAcciones();
}

function crearBarraProductividad() {
  if ($("horariosProductividad")) return;
  const div = document.createElement("div");
  div.id = "horariosProductividad";
  div.className = "horarios-productividad";
  div.innerHTML = `<button id="horariosSaveAll">Guardar</button><button id="horariosUndoAll">Deshacer todo</button><button id="horariosPaint" title="Pintar">🖌 <span>Pintar</span></button><select id="horariosPaintTurno">${TURNOS.filter(t => t.id !== "personalizado").map(t => `<option value="${t.id}">${t.label}</option>`).join("")}</select><button id="horariosCopyMonth">Copiar mes</button><button id="horariosClearSel">Limpiar selección</button><small id="horariosSeleccionCount"></small>`;
  document.querySelector(".horarios-status-row")?.after(div);
  $("horariosSaveAll").onclick = confirmarGuardado;
  $("horariosUndoAll").onclick = deshacerTodo;
  $("horariosPaint").onclick = () => { modoPincel = !modoPincel; $("horariosPaint").classList.toggle("activo", modoPincel); };
  $("horariosPaintTurno").onchange = e => turnoPincel = e.target.value;
  $("horariosCopyMonth").onclick = copiarMesCompleto;
  $("horariosClearSel").onclick = () => { seleccion.clear(); renderTabla(); actualizarAcciones(); };
  actualizarPermisos();
  actualizarAcciones();
}
function actualizarPermisos() {
  const editable = puedeEditar();
  document.body.classList.toggle("horarios-solo-lectura", !editable);
  $("horariosProductividad")?.classList.toggle("oculto", !editable || vistaActual !== "equipo");
  $("horariosEditor")?.classList.toggle("sin-permiso", !editable);
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
  if (!puedeEditar()) return;
  if (!agregar) seleccion.clear();
  seleccion.add(keyCelda(e, d));
  renderTabla();
  actualizarAcciones();
}
function seleccionarRango(e2, d2) {
  if (!seleccionInicio || !puedeEditar()) return;
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
      if (!puedeEditar()) return;
      e.preventDefault();
      const emp = td.dataset.empleado, d = Number(td.dataset.dia);
      if (modoPincel) { seleccion = new Set([keyCelda(emp, d)]); aplicarTurnoASeleccion(turnoPincel); return; }
      arrastrando = true; seleccionInicio = { empleado: emp, dia: d }; seleccionarCelda(emp, d, e.ctrlKey || e.metaKey);
    };
    td.onpointerenter = () => { if (arrastrando) seleccionarRango(td.dataset.empleado, Number(td.dataset.dia)); };
    td.ondblclick = () => { if (puedeEditar()) abrirEditor(td.dataset.empleado, Number(td.dataset.dia)); };
  });
  const w = document.querySelector("#horariosEquipoView .horarios-table-wrap");
  if (w && !w.dataset.cfg) { w.dataset.cfg = "1"; w.addEventListener("scroll", actualizarColumnaEmpleados, { passive: true }); }
  actualizarColumnaEmpleados();
}
document.addEventListener("pointerup", () => arrastrando = false);

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
  if (!puedeEditar()) return;
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
  if (!edicionActual || !puedeEditar()) return;
  let turno = edicionActual.turno;
  if (turno === "personalizado") { turno = $("horariosTurnoPersonalizado").value.trim(); if (!parsearTurno(turno)) return $("horariosTurnoPersonalizado").focus(); }
  if (seleccion.size > 1) aplicarTurnoASeleccion(turno);
  else { guardarEstado(); datos.set(clave(edicionActual.empleado, edicionActual.dia), turno); renderTodo(); }
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
  $("horariosProductividad")?.classList.toggle("oculto", !eq || !puedeEditar());
  $("horariosEditor")?.classList.toggle("oculto", !eq || !edicionActual);
  if (!eq) { cerrarEditor(); renderMiHorario(); }
}
function cambiarMes(n) { fechaVista = new Date(fechaVista.getFullYear(), fechaVista.getMonth() + n, 1); diaSeleccionado = esMesActual() ? new Date().getDate() : 1; seleccion.clear(); renderTodo(); }
function irAHoy() { const h = new Date(); fechaVista = new Date(h.getFullYear(), h.getMonth(), 1); diaSeleccionado = h.getDate(); cambiarVista("equipo"); renderTodo(); desplazarAlDia(diaSeleccionado); }
function renderTodo() { if ($("horariosMesTexto")) $("horariosMesTexto").textContent = nombreMes(); renderTabla(); renderResumen(); renderMiHorario(); actualizarPermisos(); actualizarAcciones(); }
function configurarEventos() {
  crearBarraProductividad();
  $("btnHorariosMesAnterior")?.addEventListener("click", () => cambiarMes(-1));
  $("btnHorariosMesSiguiente")?.addEventListener("click", () => cambiarMes(1));
  $("btnHorariosHoyToolbar")?.addEventListener("click", irAHoy);
  $("btnCerrarHorariosEditor")?.addEventListener("click", cerrarEditor);
  $("btnCancelarHorario")?.addEventListener("click", cerrarEditor);
  $("btnGuardarHorario")?.addEventListener("click", guardarEdicion);
  document.querySelectorAll("[data-horarios-vista]").forEach(b => b.addEventListener("click", () => cambiarVista(b.dataset.horariosVista)));
  document.addEventListener("keydown", e => { if (e.key === "Escape") { modoPincel = false; $("horariosPaint")?.classList.remove("activo"); cerrarEditor(); } });
  window.addEventListener("autoservicio:sesion", () => { actualizarPermisos(); renderMiHorario(); });
}
function activar() {
  restaurarBottomNav = [];
  document.querySelectorAll(".app-bottom-nav:not(.horarios-bottom-nav)").forEach(n => { restaurarBottomNav.push([n, n.style.display]); n.style.display = "none"; });
  renderTodo(); cambiarVista(vistaActual); if (esMesActual()) desplazarAlDia(new Date().getDate(), "auto");
}
function desactivar() { cerrarEditor(); restaurarBottomNav.forEach(([n, d]) => n.style.display = d); restaurarBottomNav = []; }

configurarEventos();
window.HorariosModule = { activar, desactivar };
