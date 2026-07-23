const empleados = ["Mica", "Agustín", "Maxi", "Ariana", "Joaquín", "Bruno"];
const TURNOS = [
  { id: "8-16", label: "8-16", clase: "turno-naranja" },
  { id: "8-13", label: "8-13", clase: "turno-amarillo" },
  { id: "9-14", label: "9-14", clase: "turno-azul" },
  { id: "10-16", label: "10-16", clase: "turno-celeste" },
  { id: "14-22", label: "14-22", clase: "turno-rojo" },
  { id: "16-22", label: "16-22", clase: "turno-violeta" },
  { id: "franco", label: "Franco", clase: "turno-franco" },
  { id: "vacaciones", label: "Vacaciones", clase: "turno-verde" }
];

let fechaVista = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let vistaActual = "equipo";
let diaSeleccionado = new Date().getDate();
let edicionActual = null;
let restaurarBottomNav = [];
const datos = new Map();

const $ = id => document.getElementById(id);

function clave(empleado, dia) {
  return `${fechaVista.getFullYear()}-${fechaVista.getMonth()}-${dia}-${empleado}`;
}

function turnoEjemplo(indiceEmpleado, dia) {
  const secuencias = [
    ["8-16", "8-16", "franco", "16-22", "16-22", "8-13", "franco"],
    ["8-13", "8-13", "8-16", "franco", "16-22", "16-22", "franco"],
    ["16-22", "16-22", "franco", "8-16", "8-16", "14-22", "franco"],
    ["14-22", "14-22", "8-16", "8-16", "franco", "16-22", "franco"],
    ["9-14", "9-14", "vacaciones", "vacaciones", "vacaciones", "franco", "franco"],
    ["10-16", "10-16", "franco", "14-22", "14-22", "8-16", "franco"]
  ];
  return secuencias[indiceEmpleado][(dia - 1) % 7];
}

function obtenerTurno(empleado, dia) {
  return datos.get(clave(empleado, dia)) || turnoEjemplo(empleados.indexOf(empleado), dia);
}

function obtenerDefinicion(id) {
  return TURNOS.find(t => t.id === id) || { id, label: id || "—", clase: "turno-personalizado" };
}

function diasDelMes() {
  return new Date(fechaVista.getFullYear(), fechaVista.getMonth() + 1, 0).getDate();
}

function nombreMes() {
  return fechaVista.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

function nombreDia(dia) {
  return new Date(fechaVista.getFullYear(), fechaVista.getMonth(), dia)
    .toLocaleDateString("es-AR", { weekday: "short" })
    .replace(".", "")
    .toUpperCase();
}

function esMesActual() {
  const hoy = new Date();
  return fechaVista.getFullYear() === hoy.getFullYear() && fechaVista.getMonth() === hoy.getMonth();
}

function esHoy(dia) {
  return esMesActual() && dia === new Date().getDate();
}

function coberturaDia(dia) {
  let manana = 0;
  let tarde = 0;
  empleados.forEach(emp => {
    const id = obtenerTurno(emp, dia);
    if (["8-16", "8-13", "9-14", "10-16"].includes(id)) manana += 1;
    if (["14-22", "16-22", "8-16"].includes(id)) tarde += 1;
  });
  return { manana, tarde };
}

function desplazarAlDia(dia, comportamiento = "smooth") {
  requestAnimationFrame(() => {
    const wrap = document.querySelector("#horariosEquipoView .horarios-table-wrap");
    const celda = document.querySelector(`#horariosTablaHead [data-horarios-dia="${dia}"]`);
    if (!wrap || !celda) return;
    const empleado = document.querySelector("#horariosTablaHead .empleado-col");
    const destino = Math.max(0, celda.offsetLeft - (empleado?.offsetWidth || 0) - 12);
    wrap.scrollTo({ left: destino, behavior: comportamiento });
  });
}

function actualizarColumnaEmpleados() {
  const wrap = document.querySelector("#horariosEquipoView .horarios-table-wrap");
  const tabla = document.querySelector("#horariosEquipoView .horarios-table");
  if (!wrap || !tabla) return;
  tabla.classList.toggle("empleados-compactos", wrap.scrollLeft > 32);
}

function renderTabla() {
  const head = $("horariosTablaHead");
  const body = $("horariosTablaBody");
  if (!head || !body) return;

  const totalDias = diasDelMes();
  head.innerHTML = `<tr><th class="empleado-col"><span class="empleado-titulo-completo">Empleado</span><span class="empleado-titulo-corto">Emp.</span></th>${Array.from({ length: totalDias }, (_, i) => {
    const dia = i + 1;
    const fecha = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), dia);
    const finde = [0, 6].includes(fecha.getDay());
    const hoy = esHoy(dia);
    const cobertura = coberturaDia(dia);
    return `<th class="${finde ? "fin-semana" : ""} ${hoy ? "dia-hoy" : ""} ${dia === diaSeleccionado ? "dia-seleccionado" : ""}" data-horarios-dia="${dia}"><span>${nombreDia(dia)}</span><strong>${dia}</strong><small class="cobertura-mini" title="Cobertura: mañana ${cobertura.manana}, tarde ${cobertura.tarde}"><b>☀ ${cobertura.manana}</b><b>☾ ${cobertura.tarde}</b></small></th>`;
  }).join("")}</tr>`;

  body.innerHTML = empleados.map((empleado, indice) => `
    <tr>
      <th class="empleado-col"><span class="empleado-avatar">${empleado.charAt(0)}</span><strong>${empleado}</strong></th>
      ${Array.from({ length: totalDias }, (_, i) => {
        const dia = i + 1;
        const turno = obtenerDefinicion(obtenerTurno(empleado, dia));
        return `<td class="${esHoy(dia) ? "dia-hoy" : ""} ${dia === diaSeleccionado ? "dia-seleccionado" : ""}" data-empleado="${empleado}" data-dia="${dia}"><button type="button" class="horario-cell ${turno.clase}" aria-label="${empleado}, día ${dia}, ${turno.label}" data-tooltip="${empleado}|${nombreDia(dia)} ${dia}|${turno.label}">${turno.label}</button></td>`;
      }).join("")}
    </tr>`).join("");

  head.querySelectorAll("[data-horarios-dia]").forEach(el => el.addEventListener("click", () => seleccionarDia(Number(el.dataset.horariosDia))));
  body.querySelectorAll("td[data-empleado]").forEach(td => td.addEventListener("click", () => abrirEditor(td.dataset.empleado, Number(td.dataset.dia))));

  const wrap = document.querySelector("#horariosEquipoView .horarios-table-wrap");
  if (wrap && !wrap.dataset.scrollConfigurado) {
    wrap.dataset.scrollConfigurado = "1";
    wrap.addEventListener("scroll", actualizarColumnaEmpleados, { passive: true });
  }
  actualizarColumnaEmpleados();
}

function renderLeyenda() {}

function seleccionarDia(dia) {
  diaSeleccionado = Math.max(1, Math.min(diasDelMes(), dia));
  renderTabla();
  renderResumen();
  desplazarAlDia(dia, "smooth");
}

function renderResumen() {
  const titulo = $("horariosDiaSeleccionado");
  const cont = $("horariosResumenDia");
  if (!titulo || !cont) return;
  const fecha = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), diaSeleccionado);
  titulo.textContent = fecha.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

  const conteo = new Map();
  empleados.forEach(emp => {
    const id = obtenerTurno(emp, diaSeleccionado);
    conteo.set(id, (conteo.get(id) || 0) + 1);
  });
  cont.innerHTML = [...conteo.entries()].map(([id, cantidad]) => {
    const turno = obtenerDefinicion(id);
    return `<div><span><i class="${turno.clase}"></i>${turno.label}</span><strong>${cantidad} ${cantidad === 1 ? "persona" : "personas"}</strong></div>`;
  }).join("");

  const manana = [...conteo.entries()].filter(([id]) => ["8-16", "8-13", "9-14", "10-16"].includes(id)).reduce((a, [,n]) => a+n, 0);
  const tarde = [...conteo.entries()].filter(([id]) => ["14-22", "16-22", "8-16"].includes(id)).reduce((a, [,n]) => a+n, 0);
  const badge = $("horariosCoberturaEstado");
  if (badge) {
    badge.textContent = `Mañana ${manana} · Tarde ${tarde}`;
    badge.classList.toggle("alerta", manana < 2 || tarde < 2);
  }
}

function abrirEditor(empleado, dia) {
  edicionActual = { empleado, dia, turno: obtenerTurno(empleado, dia) };
  $("horariosEditorEmpleado").textContent = empleado;
  $("horariosEditorFecha").textContent = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), dia).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const opciones = $("horariosTurnosOpciones");
  opciones.innerHTML = TURNOS.map(turno => `<button type="button" class="horarios-turno-option ${turno.clase} ${turno.id === edicionActual.turno ? "seleccionado" : ""}" data-turno="${turno.id}"><span></span><strong>${turno.label}</strong></button>`).join("");
  opciones.querySelectorAll("[data-turno]").forEach(btn => btn.addEventListener("click", () => {
    edicionActual.turno = btn.dataset.turno;
    opciones.querySelectorAll("[data-turno]").forEach(b => b.classList.toggle("seleccionado", b === btn));
    $("horariosTurnoPersonalizado").value = "";
  }));
  $("horariosTurnoPersonalizado").value = TURNOS.some(t => t.id === edicionActual.turno) ? "" : edicionActual.turno;
  $("horariosEditor").classList.remove("oculto");
  $("horariosEditor").setAttribute("aria-hidden", "false");
}

function cerrarEditor() {
  $("horariosEditor")?.classList.add("oculto");
  $("horariosEditor")?.setAttribute("aria-hidden", "true");
  edicionActual = null;
}

function guardarEdicion() {
  if (!edicionActual) return;
  const personalizado = $("horariosTurnoPersonalizado")?.value.trim();
  const turno = personalizado || edicionActual.turno;
  datos.set(clave(edicionActual.empleado, edicionActual.dia), turno);
  const guardar = $("btnGuardarHorario");
  if (guardar) { guardar.textContent = "✓ Aplicado"; guardar.classList.add("guardado"); }
  cerrarEditor();
  renderTabla();
  renderResumen();
}

function renderMiHorario() {
  const empleado = "Agustín";
  const lista = $("miHorarioLista");
  if (!lista) return;
  const hoy = new Date();
  const inicio = fechaVista.getMonth() === hoy.getMonth() && fechaVista.getFullYear() === hoy.getFullYear() ? hoy.getDate() : 1;
  const dias = Array.from({ length: Math.min(10, diasDelMes() - inicio + 1) }, (_, i) => inicio + i);
  lista.innerHTML = dias.map(dia => {
    const turno = obtenerDefinicion(obtenerTurno(empleado, dia));
    const fecha = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), dia);
    return `<article><div><span>${fecha.toLocaleDateString("es-AR", { weekday: "long" })}</span><strong>${dia} de ${fecha.toLocaleDateString("es-AR", { month: "long" })}</strong></div><span class="mi-turno-pill ${turno.clase}">${turno.label}</span></article>`;
  }).join("");
  const proximo = dias.find(dia => !["franco", "vacaciones"].includes(obtenerTurno(empleado, dia))) || dias[0];
  const turno = obtenerDefinicion(obtenerTurno(empleado, proximo));
  $("miHorarioProximo").textContent = turno.label;
  $("miHorarioProximoFecha").textContent = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), proximo).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

function cambiarVista(vista) {
  vistaActual = vista;
  const equipo = vista === "equipo";
  $("horariosEquipoView")?.classList.toggle("oculto", !equipo);
  $("horariosMioView")?.classList.toggle("oculto", equipo);
  $("horariosTituloVista").textContent = equipo ? "Horario del equipo" : "Mi horario";
  $("horariosSubtituloVista").textContent = equipo ? "Vista mensual de todos los empleados" : "Tus próximos turnos y francos";
  document.querySelectorAll("[data-horarios-vista]").forEach(btn => btn.classList.toggle("activo", btn.dataset.horariosVista === vista));
  if (!equipo) renderMiHorario();
}

function cambiarMes(delta) {
  fechaVista = new Date(fechaVista.getFullYear(), fechaVista.getMonth() + delta, 1);
  diaSeleccionado = esMesActual() ? new Date().getDate() : 1;
  renderTodo();
}

function irAHoy() {
  const hoy = new Date();
  fechaVista = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  diaSeleccionado = hoy.getDate();
  cambiarVista("equipo");
  renderTodo();
  desplazarAlDia(diaSeleccionado, "smooth");
}

function renderTodo() {
  if ($("horariosMesTexto")) $("horariosMesTexto").textContent = nombreMes();
  renderTabla();
  renderResumen();
  renderLeyenda();
  renderMiHorario();
}

function configurarEventos() {
  $("btnHorariosMesAnterior")?.addEventListener("click", () => cambiarMes(-1));
  $("btnHorariosMesSiguiente")?.addEventListener("click", () => cambiarMes(1));
  $("btnHorariosHoy")?.addEventListener("click", irAHoy);
  $("btnHorariosHoyToolbar")?.addEventListener("click", irAHoy);
  $("btnCerrarHorariosEditor")?.addEventListener("click", cerrarEditor);
  $("btnCancelarHorario")?.addEventListener("click", cerrarEditor);
  $("btnGuardarHorario")?.addEventListener("click", guardarEdicion);
  document.querySelectorAll("[data-horarios-vista]").forEach(btn => btn.addEventListener("click", () => cambiarVista(btn.dataset.horariosVista)));
  $("horariosEditor")?.addEventListener("click", e => e.stopPropagation());
  document.addEventListener("pointerdown", e => {
    const editor = $("horariosEditor");
    if (!editor || editor.classList.contains("oculto")) return;
    if (!editor.contains(e.target) && !e.target.closest("td[data-empleado]")) cerrarEditor();
  });
}

function activar() {
  restaurarBottomNav = [];
  document.querySelectorAll(".app-bottom-nav").forEach(nav => {
    restaurarBottomNav.push([nav, nav.style.display]);
    nav.style.display = "none";
  });
  renderTodo();
  cambiarVista(vistaActual);
  if (esMesActual()) desplazarAlDia(new Date().getDate(), "auto");
}

function desactivar() {
  cerrarEditor();
  restaurarBottomNav.forEach(([nav, display]) => { nav.style.display = display; });
  restaurarBottomNav = [];
}

configurarEventos();
window.HorariosModule = { activar, desactivar };
