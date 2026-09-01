import "./ui.js?v=1960-d21-cierre-etapa6-010926";
import { API_BASE_URL } from "./config.js?v=1960-d21-cierre-etapa6-010926";
import { escapeHTML as esc } from "./shared/dom-utils.js?v=1960-d21-cierre-etapa6-010926";
import {
  shiftSegments,
  cellLabel,
  fullScheduleLabel,
} from "./modules/horarios/schedule-format.js?v=1960-d21-cierre-etapa6-010926";

function escAttr(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

let empleados = [];
let empleadosConfiguracion = [];
let empleadosInfo = new Map();
let sectoresHorarios = [];
let sectorActual = "";
let contextoHorariosCargado = false;
let permisoEdicionServidor = false;
const detalles = new Map();
let resumenHoyDatos = new Map();
let resumenHoyClave = "";
const HORARIOS_CACHE_TTL = 30000;
const horariosPeticiones = new Map();
function cacheHorariosKey(tipo, extra = "") {
  const usuario = String(usuarioHorarios()?.usuario || "anon")
    .trim()
    .toLowerCase();
  return `autoservicio_horarios_cache_v1040:${usuario}:${tipo}:${extra}`;
}
function leerCacheHorarios(tipo, extra = "") {
  try {
    const x = JSON.parse(
      localStorage.getItem(cacheHorariosKey(tipo, extra)) || "null",
    );
    return x && x.data ? x : null;
  } catch {
    return null;
  }
}
function guardarCacheHorarios(tipo, extra, data) {
  try {
    localStorage.setItem(
      cacheHorariosKey(tipo, extra),
      JSON.stringify({ ts: Date.now(), data }),
    );
  } catch {}
}
async function fetchHorariosUnico(url, key, { forzar = false } = {}) {
  const cache = leerCacheHorarios("api", key);
  if (!forzar && cache && Date.now() - cache.ts < HORARIOS_CACHE_TTL)
    return cache.data;
  if (horariosPeticiones.has(key)) return horariosPeticiones.get(key);
  const prom = (async () => {
    const r = await fetch(url, { cache: "default" });
    const data = await r.json();
    if (!r.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudieron cargar los horarios");
    guardarCacheHorarios("api", key, data);
    return data;
  })().finally(() => horariosPeticiones.delete(key));
  horariosPeticiones.set(key, prom);
  return prom;
}

function usuarioHorarios() {
  return window.AutoservicioAuth?.getUsuario?.() || {};
}
function rolHorarios() {
  return String(usuarioHorarios().rol || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}
function puedeGestionarHorarios() {
  return ["administrador", "administracion", "supervisor"].includes(
    rolHorarios(),
  );
}
function normalizarSectorHorarios(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
function sectoresPermitidosParaUsuario(lista = []) {
  const activos = (Array.isArray(lista) ? lista : []).filter(
    (sector) => sector?.activo !== false,
  );
  if (puedeGestionarHorarios()) return activos;
  const sectorPersonal = normalizarSectorHorarios(usuarioHorarios().sector);
  const permitidos = new Set([sectorPersonal, "administracion"].filter(Boolean));
  return activos.filter((sector) =>
    permitidos.has(normalizarSectorHorarios(sector?.id)),
  );
}
function sectorSeleccionado() {
  return sectoresHorarios.find((s) => s.id === sectorActual) || null;
}
function usuarioVisibleEnCalendario(nombre) {
  return empleadosInfo.get(nombre)?.visibleCalendario !== false;
}
function listaPersonalVisible() {
  return empleadosConfiguracion.filter(usuarioVisibleEnCalendario);
}
function sincronizarPersonalVisible() {
  empleados = listaPersonalVisible();
  const sector = sectorSeleccionado();
  if (sector) {
    sector.empleadosConfiguracion = [...empleadosConfiguracion];
    sector.empleados = [...empleados];
  }
  return empleados;
}
function empleadosDelSector(id = sectorActual) {
  const sector = sectoresHorarios.find((s) => s.id === id);
  empleadosInfo = new Map(
    (sector?.empleadosInfo || []).map((x) => {
      const visibleCalendario =
        x?.visibleCalendario !== undefined
          ? x.visibleCalendario !== false
          : x?.habilitadoCalendario !== false;
      const info = { ...x, visibleCalendario };
      delete info.habilitadoCalendario;
      return [info.nombre, info];
    }),
  );
  empleadosConfiguracion = Array.isArray(sector?.empleadosConfiguracion)
    ? [...sector.empleadosConfiguracion]
    : (sector?.empleadosInfo || []).map((x) => x.nombre).filter(Boolean);
  return listaPersonalVisible();
}
function empleadosVisiblesEnTabla() {
  return empleados;
}
function puedeEditarEmpleado(nombre) {
  const rol = rolHorarios();
  if (["administrador", "administracion"].includes(rol)) return true;
  if (rol === "supervisor") return puedeEditar();
  return false;
}
async function cargarContextoHorarios() {
  const usuario = usuarioHorarios();
  const contextoCacheKey = `contexto-v1040:${usuario.usuario || "anon"}:${rolHorarios() || "sin-rol"}:${usuario.sector || "sin-sector"}:${(usuario.sectores || []).join(",")}`;
  try {
    const data = await fetchHorariosUnico(
      `${API_BASE_URL}/horarios/contexto`,
      contextoCacheKey,
      { forzar: true },
    );
    sectoresHorarios = sectoresPermitidosParaUsuario(data.sectores || []);
    permisoEdicionServidor = data.puedeEditar === true;
    const puedeElegirSector = sectoresHorarios.length > 1;
    const preferido = puedeElegirSector
      ? sectorActual && sectoresHorarios.some((s) => s.id === sectorActual)
        ? sectorActual
        : usuario.sector || sectoresHorarios[0]?.id
      : usuario.sector || sectoresHorarios[0]?.id;
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
    const respaldo = leerCacheHorarios("api", contextoCacheKey)?.data;
    if (respaldo?.sectores?.length) {
      sectoresHorarios = sectoresPermitidosParaUsuario(
        respaldo.sectores || [],
      );
      permisoEdicionServidor = respaldo.puedeEditar === true;
      const usuario = usuarioHorarios();
      sectorActual =
        sectorActual && sectoresHorarios.some((s) => s.id === sectorActual)
          ? sectorActual
          : usuario.sector || sectoresHorarios[0]?.id || "";
      empleados = empleadosDelSector();
    }
    contextoHorariosCargado = true;
    renderSelectorSector();
    renderTodo();
    avisoHorarios(
      "No se pudo actualizar. Se muestran los últimos datos guardados.",
      "error",
    );
  }
}
function crearSelectorSector() {
  if ($("horariosSectorBar")) return;
  const bar = document.createElement("section");
  bar.id = "horariosSectorBar";
  bar.className = "horarios-sector-bar";
  bar.innerHTML = `
    <span class="horarios-control-icon horarios-control-icon-sector" aria-hidden="true"><svg class="app-icon"><use href="#icon-store"></use></svg></span>
    <div class="horarios-sector-identidad"><span>Sector</span></div>
    <div id="horariosSectorSelectorWrap" class="horarios-sector-selector oculto"><button id="horariosSectorSelectorButton" type="button" class="visual-select-button" aria-label="Cambiar sector"><span id="horariosSectorNombre">—</span><svg class="app-icon"><use href="#icon-chevron-down"></use></svg></button></div>`;
  document.querySelector(".horarios-toolbar")?.after(bar);
  organizarControlesCalendario();
  $("horariosSectorSelectorButton").onclick = async () => {
    document.body.classList.add("horarios-selector-sector-abierto");
    let elegido = null;
    try {
      elegido = await window.AppChoicePicker.open({
        title: "Seleccionar sector",
        kicker: "Calendario",
        value: sectorActual,
        options: sectoresHorarios.map((sec) => ({
          value: sec.id,
          label: sec.nombre,
          color: sec.color,
          description:
            sec.id === sectorActual ? "Sector actual" : "Cambiar a este sector",
        })),
      });
    } finally {
      document.body.classList.remove("horarios-selector-sector-abierto");
    }
    if (!elegido || elegido === sectorActual) return;
    if (vistaActual === "config") {
      const puedeCambiar = await confirmarDescartarOrdenConfig();
      if (!puedeCambiar) return;
    }
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
  if ($("horariosSectorNombre"))
    $("horariosSectorNombre").textContent = sector?.nombre || "Sin sector";
  const wrap = $("horariosSectorSelectorWrap");
  const selectButton = $("horariosSectorSelectorButton");
  // El servidor ya entrega únicamente los sectores que cada rol puede consultar.
  // Personal recibe su sector + Administración; Supervisor/Administración/Admin
  // reciben todos los sectores. El selector puede mostrarse sin duplicar reglas.
  if (wrap)
    wrap.classList.toggle(
      "oculto",
      !["equipo", "config"].includes(vistaActual),
    );
  if (selectButton)
    selectButton.querySelector("span").textContent =
      sector?.nombre || "Sin sector";
  const subtitulo = $("horariosSubtituloVista");
  if (subtitulo)
    subtitulo.textContent =
      vistaActual === "equipo"
        ? `Calendario mensual de ${sector?.nombre || "este sector"}`
        : `Tus próximos turnos en ${sector?.nombre || "tu sector"}`;
}

let TURNOS = [];
function cargarTurnosConfigurados() {
  const configurados = window.AutoservicioHorariosConfig?.cargar?.() || [];
  TURNOS = configurados
    .map((t) => ({
      ...t,
      label:
        t.tipo === "cortado"
          ? `${t.inicio} - ${t.fin} / ${t.inicio2} - ${t.fin2}`
          : `${t.inicio} - ${t.fin}`,
      clase: "turno-configurable",
      estilo: `--turno-color:${t.color};--turno-fondo:${t.color}22;--turno-borde:${t.color}66`,
    }))
    .concat([
      {
        id: "franco",
        label: "Franco",
        color: "#9ca3af",
        clase: "turno-franco",
        estilo: "background:#e5e7eb;color:#374151;border-color:#cbd5e1",
      },
      {
        id: "vacaciones",
        label: "Vacaciones",
        color: "#22c55e",
        clase: "turno-vacaciones",
        estilo: "background:#dcfce7;color:#15803d;border-color:#86efac",
      },
      {
        id: "ausente",
        label: "Ausente",
        color: "#ef4444",
        clase: "turno-ausente",
        estilo: "background:#fee2e2;color:#dc2626;border-color:#fca5a5",
      },
      {
        id: "licencia",
        label: "Licencia",
        color: "#3b82f6",
        clase: "turno-licencia",
        estilo: "background:#dbeafe;color:#1d4ed8;border-color:#93c5fd",
      },
    ]);
  if (!TURNOS.some((t) => t.id === turnoPincel))
    turnoPincel =
      TURNOS.find((t) => !["franco", "vacaciones"].includes(t.id))?.id ||
      "franco";
}

let fechaVista = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let vistaActual = "equipo";
let diaSeleccionado = new Date().getDate();
let turnoPincel = "8-16";
let seleccionInicio = null;
let seleccionBaseArrastre = new Set();
let punteroSeleccion = null;
let estadoInicialEdicion = null;
let estadoInicialDetalles = null;
let seleccion = new Set();
let modoEdicion = false;

cargarTurnosConfigurados();

const datos = new Map();
const $ = (id) => document.getElementById(id);
const keyCelda = (empleado, dia) => `${empleado}::${dia}`;

/* =========================================================
   Feriados nacionales Argentina 2026
   ========================================================= */
const FERIADOS_ARGENTINA_2026 = new Map([
  ["2026-01-01", "Año Nuevo"],
  ["2026-02-16", "Carnaval"],
  ["2026-02-17", "Carnaval"],
  ["2026-03-23", "Día no laborable con fines turísticos"],
  ["2026-03-24", "Día Nacional de la Memoria por la Verdad y la Justicia"],
  ["2026-04-02", "Día del Veterano y de los Caídos en la Guerra de Malvinas"],
  ["2026-04-03", "Viernes Santo"],
  ["2026-05-01", "Día del Trabajo"],
  ["2026-05-25", "Día de la Revolución de Mayo"],
  ["2026-06-15", "Paso a la Inmortalidad del General Martín Miguel de Güemes"],
  ["2026-06-20", "Paso a la Inmortalidad del General Manuel Belgrano"],
  ["2026-07-09", "Día de la Independencia"],
  ["2026-07-10", "Día no laborable con fines turísticos"],
  ["2026-08-17", "Paso a la Inmortalidad del General José de San Martín"],
  ["2026-10-12", "Día del Respeto a la Diversidad Cultural"],
  ["2026-11-23", "Día de la Soberanía Nacional"],
  ["2026-12-07", "Día no laborable con fines turísticos"],
  ["2026-12-08", "Día de la Inmaculada Concepción de María"],
  ["2026-12-25", "Navidad"],
]);

function claveFechaHorarios(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}
function obtenerFeriadoDia(dia, fecha = fechaVista) {
  const f = new Date(fecha.getFullYear(), fecha.getMonth(), dia);
  return FERIADOS_ARGENTINA_2026.get(claveFechaHorarios(f)) || "";
}
function claveMes(fecha, empleado, dia) {
  return `${sectorActual || "general"}|${fecha.getFullYear()}-${fecha.getMonth()}-${dia}-${empleado}`;
}
function clave(empleado, dia) {
  return claveMes(fechaVista, empleado, dia);
}
function mesClave(fecha = fechaVista) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}
function claveResumenHoy(empleado) {
  return String(empleado || "").trim();
}
async function cargarResumenHoy(forzar = false) {
  if (!sectorActual) {
    resumenHoyDatos = new Map();
    resumenHoyClave = "";
    return;
  }
  const hoy = new Date();
  const mesHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const claveCarga = `${sectorActual}|${mesHoy}|${hoy.getDate()}`;
  if (!forzar && resumenHoyClave === claveCarga) return;
  try {
    if (mesClave() === mesHoy) {
      resumenHoyDatos = new Map(
        empleados.map((e) => [
          claveResumenHoy(e),
          obtenerTurno(e, hoy.getDate()),
        ]),
      );
    } else {
      const data = await fetchHorariosUnico(
        `${API_BASE_URL}/horarios/calendario?sector=${encodeURIComponent(sectorActual)}&mes=${mesHoy}`,
        `cal:${sectorActual}:${mesHoy}`,
      );
      const mapa = new Map();
      (data.celdas || [])
        .filter((c) => Number(c.dia) === hoy.getDate())
        .forEach((c) =>
          mapa.set(claveResumenHoy(c.empleado), String(c.turno || "")),
        );
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
async function cargarCalendarioActual(forzar = false) {
  if (!sectorActual) return;
  const cacheKey = `cal:${sectorActual}:${mesClave()}`;
  try {
    const data = await fetchHorariosUnico(
      `${API_BASE_URL}/horarios/calendario?sector=${encodeURIComponent(sectorActual)}&mes=${mesClave()}`,
      cacheKey,
      { forzar },
    );
    limpiarMesDatos();
    (data.celdas || []).forEach((c) =>
      datos.set(clave(String(c.empleado), Number(c.dia)), String(c.turno)),
    );
    detalles.clear();
    (data.detalles || []).forEach((x) =>
      detalles.set(keyCelda(String(x.empleado), Number(x.dia)), {
        tipo: x.tipo || "",
        motivo: x.motivo || "",
        observacion: x.observacion || "",
      }),
    );
    if (Array.isArray(data.turnos) && data.turnos.length) {
      window.AutoservicioHorariosConfig?.guardarLocal?.(
        data.turnos,
        sectorActual,
      );
      cargarTurnosConfigurados();
    }
  } catch (error) {
    const respaldo = leerCacheHorarios("api", cacheKey)?.data;
    if (respaldo) {
      limpiarMesDatos();
      (respaldo.celdas || []).forEach((c) =>
        datos.set(clave(String(c.empleado), Number(c.dia)), String(c.turno)),
      );
      detalles.clear();
      (respaldo.detalles || []).forEach((x) =>
        detalles.set(keyCelda(String(x.empleado), Number(x.dia)), {
          tipo: x.tipo || "",
          motivo: x.motivo || "",
          observacion: x.observacion || "",
        }),
      );
    }
    avisoHorarios(
      "No se pudo actualizar el calendario. Se muestran los últimos datos guardados.",
      "error",
    );
  }
}
function obtenerTurnoEn(fecha, e, d) {
  return datos.get(claveMes(fecha, e, d)) || "";
}
function obtenerTurno(e, d) {
  return obtenerTurnoEn(fechaVista, e, d);
}
function obtenerDefinicion(id) {
  return (
    TURNOS.find((t) => t.id === id) || {
      id,
      label: id || "—",
      clase: "turno-personalizado",
      estilo: "",
    }
  );
}
function diasDelMes(fecha = fechaVista) {
  return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
}
function nombreMes() {
  return fechaVista.toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
}
function nombreMesControlCalendario() {
  const mes = fechaVista.toLocaleDateString("es-AR", { month: "long" });
  return mes ? mes.charAt(0).toUpperCase() + mes.slice(1) : "";
}
function nombreDia(d) {
  return new Date(fechaVista.getFullYear(), fechaVista.getMonth(), d)
    .toLocaleDateString("es-AR", { weekday: "short" })
    .replace(".", "")
    .toUpperCase();
}
function esMesActual() {
  const h = new Date();
  return (
    fechaVista.getFullYear() === h.getFullYear() &&
    fechaVista.getMonth() === h.getMonth()
  );
}
function esHoy(d) {
  return esMesActual() && d === new Date().getDate();
}
function puedeEditar() {
  if (!permisoEdicionServidor) return false;
  const sector = sectorSeleccionado();
  // El servidor es la fuente de verdad. Esto evita que una sesión antigua,
  // guardada antes de asignar varios sectores, oculte el botón Editar.
  return sector?.puedeEditar === true;
}

function segmentosDeTurno(id) {
  return shiftSegments(id, TURNOS);
}
function formatoCelda(id) {
  return cellLabel(id, TURNOS);
}
function formatoHorario24(id) {
  return fullScheduleLabel(id, TURNOS);
}
function coberturaDia(d) {
  let manana = 0,
    tarde = 0;
  empleados.forEach((e) => {
    const segmentos = segmentosDeTurno(obtenerTurno(e, d));
    if (
      segmentos.some(
        (x) =>
          Number(x.inicio.slice(0, 2)) < 14 && Number(x.fin.slice(0, 2)) >= 8,
      )
    )
      manana++;
    if (
      segmentos.some(
        (x) =>
          Number(x.inicio.slice(0, 2)) < 22 && Number(x.fin.slice(0, 2)) > 14,
      )
    )
      tarde++;
  });
  return { manana, tarde };
}

function clonarDatos() {
  return new Map(datos);
}
function clonarDetalles(origen = detalles) {
  return new Map(
    [...origen].map(([k, v]) => [
      k,
      v && typeof v === "object" ? { ...v } : v,
    ]),
  );
}
function mapasIguales(a, b) {
  if (!a || !b || a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}
function detalleComparable(valor) {
  return [
    String(valor?.tipo || ""),
    String(valor?.motivo || ""),
    String(valor?.observacion || ""),
  ].join("\u0000");
}
function detallesIguales(a, b) {
  if (!a || !b || a.size !== b.size) return false;
  for (const [k, v] of a)
    if (!b.has(k) || detalleComparable(v) !== detalleComparable(b.get(k)))
      return false;
  return true;
}
function restaurarDatos(estado) {
  datos.clear();
  estado?.forEach((v, k) => datos.set(k, v));
}
function restaurarDetalles(estado) {
  detalles.clear();
  estado?.forEach((v, k) =>
    detalles.set(k, v && typeof v === "object" ? { ...v } : v),
  );
}
function hayCambiosPendientes() {
  return !!(
    modoEdicion &&
    ((estadoInicialEdicion && !mapasIguales(datos, estadoInicialEdicion)) ||
      (estadoInicialDetalles &&
        !detallesIguales(detalles, estadoInicialDetalles)))
  );
}
async function cancelarTodoCambios() {
  if (!modoEdicion) return false;
  const teniaCambios = hayCambiosPendientes();
  if (teniaCambios) {
    const accion = await dialogoHorarios({
      titulo: "Hay cambios sin guardar",
      mensaje: "Podés guardar los cambios y salir, eliminar lo modificado o volver al calendario para seguir editando.",
      confirmar: "Guardar cambios",
      alternativo: "Eliminar cambios",
      alternativoPeligro: true,
      kicker: "Edición de horarios",
      variante: "sin-guardar",
      cerrarConX: true,
      ocultarCancelar: true,
    });
    if (accion === false) return false;
    if (accion === "alternativo") {
      restaurarDatos(estadoInicialEdicion);
      restaurarDetalles(estadoInicialDetalles);
      seleccion.clear();
      await salirModoEdicion(true);
      renderTodo();
      return true;
    }
    await confirmarGuardado();
    return true;
  }
  seleccion.clear();
  await salirModoEdicion(true);
  renderTodo();
  return true;
}
function serializarCeldasDesdeMapa(mapa) {
  const salida = [];
  for (let d = 1; d <= diasDelMes(); d++)
    empleados.forEach((empleado) => {
      const turno = mapa?.get?.(clave(empleado, d)) || "";
      if (turno) salida.push({ empleado, dia: d, turno });
    });
  return salida;
}
async function confirmarGuardado() {
  if (!modoEdicion || !hayCambiosPendientes() || !puedeEditar()) return;
  const boton = $("horariosSaveChanges");
  if (boton) boton.disabled = true;
  try {
    const celdas = serializarCeldasDesdeMapa(datos);
    const baseCeldas = serializarCeldasDesdeMapa(
      estadoInicialEdicion || new Map(),
    );
    const respuesta = await fetch(`${API_BASE_URL}/horarios/calendario`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sector: sectorActual,
        mes: mesClave(),
        celdas,
        baseCeldas,
        detalles: [...detalles].map(([k, v]) => {
          const [empleado, dia] = k.split("::");
          return { empleado, dia: Number(dia), ...v };
        }),
      }),
    });
    const data = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudo validar el guardado");
    guardarCacheHorarios("api", `cal:${sectorActual}:${mesClave()}`, {
      ok: true,
      sector: sectorActual,
      mes: mesClave(),
      celdas: serializarCeldasDesdeMapa(datos),
      detalles: [...detalles].map(([k, v]) => {
        const [empleado, dia] = k.split("::");
        return { empleado, dia: Number(dia), ...v };
      }),
      turnos: window.AutoservicioHorariosConfig?.cargar?.(sectorActual) || [],
    });
    seleccion.clear();
    await salirModoEdicion(true);
    await cargarResumenHoy(true);
    renderTodo();
    avisoHorarios("Cambios guardados");
  } catch (error) {
    avisoHorarios(
      error.message || "No se pudieron guardar los cambios",
      "error",
    );
    actualizarAcciones();
  }
}
function actualizarAcciones() {
  const pendientes = hayCambiosPendientes();
  const acciones = $("horariosEditActions");
  acciones?.classList.toggle("oculto", !modoEdicion);
  acciones?.setAttribute("aria-hidden", modoEdicion ? "false" : "true");
  if ($("horariosSaveChanges")) $("horariosSaveChanges").disabled = !pendientes;
  if ($("horariosCancelAll")) $("horariosCancelAll").disabled = !modoEdicion;
  const c = $("horariosSeleccionCount");
  if (c)
    c.textContent = seleccion.size
      ? `${seleccion.size} casilla${seleccion.size > 1 ? "s" : ""} seleccionada${seleccion.size > 1 ? "s" : ""}`
      : "Seleccioná una o más casillas";
  const aplicar = $("horariosPaint");
  if (aplicar) aplicar.disabled = !seleccion.size || !modoEdicion;
  const limpiar = $("horariosClearSelection");
  if (limpiar) limpiar.classList.toggle("oculto", !seleccion.size);

  const modo = $("horariosModoEstado");
  if (modo) modo.textContent = modoEdicion ? "Modo edición" : "Modo lectura";
}
function aplicarTurnoASeleccion(turno) {
  if (!seleccion.size || !puedeEditar() || !modoEdicion) return;
  seleccion.forEach((k) => {
    const [e, d] = k.split("::");
    const dataKey = clave(e, Number(d));
    const anterior = datos.get(dataKey) || "";
    if (anterior === turno) return;
    datos.set(dataKey, turno);
    // Al reemplazar una asignación se descartan sus notas previas para evitar
    // guardar metadatos que ya no corresponden al turno visible.
    detalles.delete(k);
  });
  seleccion.clear();
  renderTodo();
}

function avisoHorarios(texto, tipo = "ok") {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = texto;
  toast.className = `toast mostrar ${tipo}`;
  clearTimeout(avisoHorarios.timer);
  avisoHorarios.timer = setTimeout(() => {
    toast.className = "toast";
  }, 2200);
}
function asegurarDialogoHorarios() {
  if ($("horariosDialogo")) return;
  const modal = document.createElement("div");
  modal.id = "horariosDialogo";
  modal.className = "horarios-dialogo-overlay oculto";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="horarios-dialogo-card" role="dialog" aria-modal="true" aria-labelledby="horariosDialogoTitulo">
      <div class="horarios-dialogo-cabecera">
        <span class="horarios-dialogo-icono" aria-hidden="true">
          <svg class="app-icon"><use href="#icon-shield"></use></svg>
        </span>
        <div class="horarios-dialogo-copy">
          <span id="horariosDialogoKicker" class="horarios-dialogo-kicker">Horarios</span>
          <h3 id="horariosDialogoTitulo">Confirmar acción</h3>
        </div>
        <button id="horariosDialogoCerrar" type="button" class="horarios-dialogo-cerrar oculto" aria-label="Cerrar">×</button>
      </div>
      <p id="horariosDialogoMensaje"></p>
      <div class="horarios-dialogo-actions">
        <button id="horariosDialogoAlternativo" type="button" class="alternativo oculto">Eliminar cambios</button>
        <button id="horariosDialogoConfirmar" type="button" class="primario">Confirmar</button>
        <button id="horariosDialogoCancelar" type="button">Volver</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}
function dialogoHorarios({
  titulo,
  mensaje,
  confirmar = "Confirmar",
  peligro = false,
  alternativo = "",
  alternativoPeligro = false,
  soloAceptar = false,
  variante = "default",
  kicker = "Horarios",
  cerrarConX = false,
  ocultarCancelar = false,
}) {
  asegurarDialogoHorarios();
  const modal = $("horariosDialogo");
  const btnConfirmar = $("horariosDialogoConfirmar");
  const btnAlternativo = $("horariosDialogoAlternativo");
  const btnCancelar = $("horariosDialogoCancelar");
  const btnCerrar = $("horariosDialogoCerrar");
  const card = modal.querySelector(".horarios-dialogo-card");
  card?.classList.toggle("horarios-dialogo-card--permiso", variante === "permiso");
  card?.classList.toggle("horarios-dialogo-card--sin-guardar", variante === "sin-guardar");
  $("horariosDialogoKicker").textContent = kicker;
  $("horariosDialogoTitulo").textContent = titulo;
  $("horariosDialogoMensaje").textContent = mensaje;
  btnConfirmar.textContent = confirmar;
  btnConfirmar.classList.toggle("peligro", peligro);
  btnAlternativo.textContent = alternativo || "";
  btnAlternativo.classList.toggle("oculto", !alternativo);
  btnAlternativo.classList.toggle("peligro", alternativoPeligro);
  btnCancelar.classList.toggle("oculto", soloAceptar || ocultarCancelar);
  btnCerrar.classList.toggle("oculto", !cerrarConX);
  modal.classList.remove("oculto");
  modal.setAttribute("aria-hidden", "false");
  return new Promise((resolve) => {
    const cerrar = (valor) => {
      modal.classList.add("oculto");
      modal.setAttribute("aria-hidden", "true");
      btnConfirmar.onclick = null;
      btnAlternativo.onclick = null;
      btnCancelar.onclick = null;
      btnCerrar.onclick = null;
      modal.onclick = null;
      resolve(valor);
    };
    btnConfirmar.onclick = () => cerrar(true);
    btnAlternativo.onclick = () => cerrar("alternativo");
    btnCancelar.onclick = () => cerrar(false);
    btnCerrar.onclick = () => cerrar(false);
    modal.onclick = (e) => {
      if (e.target === modal && !cerrarConX) cerrar(false);
    };
  });
}
function actualizarSelectorTurnos() {
  const opcion =
    TURNOS.find((t) => t.id === turnoPincel) ||
    TURNOS.find((t) => t.id !== "personalizado");
  if (opcion) turnoPincel = opcion.id;
}

function decorarControlesCalendario() {
  const nav = document.querySelector("#pantallaHorarios .horarios-month-nav");
  if (nav && !nav.querySelector(".horarios-control-icon-month")) {
    nav.insertAdjacentHTML(
      "afterbegin",
      '<span class="horarios-control-icon horarios-control-icon-month" aria-hidden="true"><svg class="app-icon"><use href="#icon-calendar"></use></svg></span>',
    );
  }
}

function renderEtiquetaCalendario() {
  const board = document.querySelector("#horariosEquipoView .horarios-board-card");
  if (!board) return;
  let etiqueta = $("horariosCalendarioEtiqueta");
  if (!etiqueta) {
    etiqueta = document.createElement("section");
    etiqueta.id = "horariosCalendarioEtiqueta";
    etiqueta.className = "horarios-calendar-labelbar";
    const wrap = board.querySelector(".horarios-table-wrap");
    if (wrap) board.insertBefore(etiqueta, wrap);
    else board.prepend(etiqueta);
  }
  etiqueta.innerHTML = `<span>CALENDARIO</span>`;
}

function crearControlConfiguracionCalendario() {
  if ($("horariosConfigControl")) return;
  const control = document.createElement("button");
  control.id = "horariosConfigControl";
  control.type = "button";
  control.className = "horarios-config-control";
  control.setAttribute("aria-label", "Abrir configuración de horarios");
  control.innerHTML = `
    <span class="horarios-control-icon horarios-control-icon-config" aria-hidden="true"><svg class="app-icon"><use href="#icon-settings"></use></svg></span>
    <span class="horarios-config-copy">
      <span>Configuración</span>
    </span>
    <span class="horarios-control-spacer" aria-hidden="true"></span>`;
  control.addEventListener("click", async () => {
    await cambiarVista("config");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.querySelector("#pantallaHorarios .horarios-content")?.appendChild(control);
}

function organizarControlesCalendario() {
  const content = document.querySelector("#pantallaHorarios .horarios-content");
  const toolbar = document.querySelector("#pantallaHorarios .horarios-toolbar");
  const sector = $("horariosSectorBar");
  const config = $("horariosConfigControl");
  const editor = $("horariosEdicionMarco");
  const status = document.querySelector(
    "#pantallaHorarios .horarios-status-row",
  );
  if (!content || !toolbar || !sector || !config || !editor) return;
  let deck = $("horariosControlDeck");
  if (!deck) {
    deck = document.createElement("section");
    deck.id = "horariosControlDeck";
    deck.className = "horarios-control-deck";
    content.insertBefore(deck, toolbar);
  }
  if (toolbar.parentElement !== deck) deck.appendChild(toolbar);
  if (sector.parentElement !== deck) deck.appendChild(sector);
  if (config.parentElement !== deck) deck.appendChild(config);
  if (editor.parentElement !== deck) deck.appendChild(editor);
  if (status && status.parentElement !== deck) deck.appendChild(status);
  decorarControlesCalendario();
}

function ubicarSelectorSectorSegunVista(vista = vistaActual) {
  const sector = $("horariosSectorBar");
  if (!sector) return;
  const deck = $("horariosControlDeck");
  const slotConfig = $("horariosConfigSectorSlot");

  if (vista === "config" && slotConfig) {
    if (sector.parentElement !== slotConfig) slotConfig.appendChild(sector);
    return;
  }

  if (!deck) return;
  const controlConfig = $("horariosConfigControl");
  if (sector.parentElement !== deck) {
    if (controlConfig?.parentElement === deck) deck.insertBefore(sector, controlConfig);
    else deck.appendChild(sector);
  }
}

function opcionesSelectorTurnos() {
  const iniciales = {
    franco: "F",
    vacaciones: "V",
    ausente: "A",
    licencia: "L",
  };
  const descripciones = {
    franco: "Día libre",
    vacaciones: "Vacaciones",
    ausente: "Ausencia",
    licencia: "Licencia",
  };
  const coloresEspeciales = {
    franco: "#9ca3af",
    vacaciones: "#22c55e",
    ausente: "#ef4444",
    licencia: "#f59e0b",
  };
  return TURNOS.filter((t) => t.id !== "personalizado").map((t) => ({
    value: t.id,
    label: t.label,
    color: t.color || coloresEspeciales[t.id] || "#ffffff",
    badge: iniciales[t.id] || (t.tipo === "cortado" ? "C" : ""),
    description:
      descripciones[t.id] ||
      (t.tipo === "cortado" ? "Horario cortado" : "Horario continuo"),
  }));
}
async function abrirSelectorTurnos(evento) {
  evento?.preventDefault?.();
  evento?.stopPropagation?.();
  const picker = window.AppChoicePicker;
  if (!picker?.open) {
    avisoHorarios(
      "No se pudo abrir el selector de horarios. Recargá la aplicación e intentá nuevamente.",
      "error",
    );
    return false;
  }
  document.body.classList.add("horarios-selector-turno-abierto");
  try {
    const elegido = await picker.open({
      title: "Seleccionar horario",
      kicker: "Pintar con",
      options: opcionesSelectorTurnos(),
      value: turnoPincel,
    });
    if (elegido === null || elegido === undefined || elegido === "") return false;
    turnoPincel = elegido;
    actualizarSelectorTurnos();
    actualizarAcciones();
    return true;
  } finally {
    document.body.classList.remove("horarios-selector-turno-abierto");
  }
}

function crearControlesEdicionCalendario() {
  if ($("horariosEdicionMarco")) return;
  const marco = document.createElement("section");
  marco.id = "horariosEdicionMarco";
  marco.className = "horarios-edicion-marco";
  marco.innerHTML = `
    <div id="horariosConsultaAcciones" class="horarios-consulta-acciones">
      <span class="horarios-control-icon horarios-control-icon-mode" aria-hidden="true"><svg class="app-icon"><use href="#icon-eye"></use></svg></span>
      <div class="horarios-modo-copy">
        <span id="horariosModoEstado">Modo lectura</span>
      </div>
      <button id="btnHorariosEditar" type="button" class="horarios-editar-btn">
        <svg class="app-icon" aria-hidden="true"><use href="#icon-edit"></use></svg>
        <span>Editar</span>
      </button>
    </div>`;
  document.querySelector(".horarios-status-row")?.after(marco);

  let acciones = $("horariosEditActions");
  if (!acciones) {
    acciones = document.createElement("section");
    acciones.id = "horariosEditActions";
    acciones.className = "horarios-edit-actions oculto";
    acciones.setAttribute("aria-hidden", "true");
    acciones.innerHTML = `
      <div class="horarios-edit-buttons">
        <button id="horariosPaint" type="button" class="horarios-action-paint" disabled>
          <span aria-hidden="true">✎</span><strong>Pintar</strong>
        </button>
        <button id="horariosSaveChanges" type="button" class="horarios-action-save" disabled>
          <span aria-hidden="true">✓</span><strong>Guardar</strong>
        </button>
        <button id="horariosCancelAll" type="button" class="horarios-action-cancel">
          <span aria-hidden="true">×</span><strong>Cancelar</strong>
        </button>
      </div>
      <div class="horarios-seleccion-info">
        <small id="horariosSeleccionCount" class="horarios-seleccion-count" aria-live="polite">Seleccioná una o más casillas</small>
        <button id="horariosClearSelection" type="button" class="horarios-limpiar-seleccion oculto">Limpiar selección</button>
      </div>`;
    document.querySelector("#horariosEquipoView .horarios-board-card")?.before(acciones);
  }

  organizarControlesCalendario();
  $("btnHorariosEditar").onclick = entrarModoEdicion;
  $("horariosPaint").onclick = () => aplicarTurnoASeleccion(turnoPincel);
  $("horariosClearSelection").onclick = () => {
    seleccion.clear();
    renderTabla();
    actualizarAcciones();
  };
  $("horariosSaveChanges").onclick = confirmarGuardado;
  $("horariosCancelAll").onclick = cancelarTodoCambios;
  actualizarSelectorTurnos();
  actualizarPermisos();
  actualizarAcciones();
}
async function entrarModoEdicion(evento) {
  if (!puedeEditar()) return false;
  const elegido = await abrirSelectorTurnos(evento);
  if (!elegido) return false;
  if (modoEdicion) {
    actualizarAcciones();
    return true;
  }
  modoEdicion = true;
  estadoInicialEdicion = clonarDatos();
  estadoInicialDetalles = clonarDetalles();
  punteroSeleccion = null;
  seleccion.clear();
  seleccionBaseArrastre.clear();
  document.body.classList.add("horarios-modo-edicion");
  actualizarAcciones();
  renderTabla();
  return true;
}
async function salirModoEdicion(forzar = false) {
  if (!forzar && hayCambiosPendientes()) {
    const ok = await dialogoHorarios({
      titulo: "Salir sin guardar",
      mensaje: "Hay cambios pendientes. Si salís ahora, se descartarán.",
      confirmar: "Descartar y salir",
      peligro: true,
    });
    if (!ok) return false;
    restaurarDatos(estadoInicialEdicion);
    restaurarDetalles(estadoInicialDetalles);
  }
  modoEdicion = false;
  punteroSeleccion = null;
  seleccionBaseArrastre.clear();
  estadoInicialEdicion = null;
  estadoInicialDetalles = null;
  seleccion.clear();
  document.body.classList.remove("horarios-modo-edicion");
  renderTabla();
  actualizarAcciones();
  return true;
}
function actualizarPermisos() {
  const editable = puedeEditar();
  document.body.classList.toggle("horarios-solo-lectura", !editable);

  // La pantalla Calendario conserva siempre los cuatro módulos superiores.
  // Los permisos cambian las acciones, no la estructura visual.
  $("horariosEdicionMarco")?.classList.toggle(
    "oculto",
    vistaActual !== "equipo",
  );
  $("btnHorariosEditar")?.classList.toggle("oculto", !editable);
  $("horariosConfigControl")?.classList.toggle(
    "oculto",
    vistaActual !== "equipo",
  );
  if (!editable && modoEdicion) {
    restaurarDatos(estadoInicialEdicion);
    restaurarDetalles(estadoInicialDetalles);
    salirModoEdicion(true);
  }
}

function desplazarAlDia(d, behavior = "smooth") {
  requestAnimationFrame(() => {
    const w = document.querySelector(
      "#horariosEquipoView .horarios-table-wrap",
    );
    const c = document.querySelector(
      `#horariosTablaHead [data-horarios-dia="${d}"]`,
    );
    const e = document.querySelector("#horariosTablaHead .empleado-col");
    if (w && c)
      w.scrollTo({
        left: Math.max(0, c.offsetLeft - (e?.offsetWidth || 0) - 12),
        behavior,
      });
  });
}
function actualizarColumnaEmpleados() {
  const w = document.querySelector("#horariosEquipoView .horarios-table-wrap"),
    t = document.querySelector("#horariosEquipoView .horarios-table");
  if (!w || !t) return;
  // En teléfono la columna PERSONAL se compacta a una única inicial apenas
  // el usuario empieza a recorrer el mes. No existe una segunda etapa que
  // vuelva a cambiar el ancho o esconda la referencia del personal.
  t.classList.toggle("empleados-compactos", w.scrollLeft > 24);
}
function alternarCelda(e, d) {
  if (!puedeEditar() || !modoEdicion) return;
  const k = keyCelda(e, d);
  if (seleccion.has(k)) seleccion.delete(k);
  else seleccion.add(k);
  renderTabla();
  actualizarAcciones();
}
function seleccionarRango(e2, d2) {
  if (!seleccionInicio || !puedeEditar() || !modoEdicion) return;
  const i1 = empleados.indexOf(seleccionInicio.empleado),
    i2 = empleados.indexOf(e2),
    d1 = seleccionInicio.dia;
  seleccion = new Set(seleccionBaseArrastre);
  for (let i = Math.min(i1, i2); i <= Math.max(i1, i2); i++) {
    for (let d = Math.min(d1, d2); d <= Math.max(d1, d2); d++)
      if (puedeEditarEmpleado(empleados[i]))
        seleccion.add(keyCelda(empleados[i], d));
  }
  renderTabla();
  actualizarAcciones();
}
function celdaDesdePunto(x, y) {
  return (
    document
      .elementFromPoint(x, y)
      ?.closest?.("#horariosTablaBody td[data-empleado]") || null
  );
}
function renderTabla() {
  const head = $("horariosTablaHead"),
    body = $("horariosTablaBody");
  if (!head || !body) return;
  const tabla = head.closest(".horarios-table");
  if (tabla) {
    let columnas = tabla.querySelector("#horariosTablaColumnas");
    if (!columnas) {
      columnas = document.createElement("colgroup");
      columnas.id = "horariosTablaColumnas";
      tabla.insertBefore(columnas, head);
    }
    columnas.innerHTML = `<col class="horarios-col-personal">${Array.from(
      { length: diasDelMes() },
      () => '<col class="horarios-col-dia">',
    ).join("")}`;
  }
  head.innerHTML = `<tr><th class="empleado-col"><span class="empleado-titulo-completo">PERSONAL</span><span class="empleado-titulo-corto" aria-label="Personal">P</span></th>${Array.from(
    { length: diasDelMes() },
    (_, i) => {
      const d = i + 1,
        f = new Date(fechaVista.getFullYear(), fechaVista.getMonth(), d),
        finde = [0, 6].includes(f.getDay()),
        feriado = obtenerFeriadoDia(d),
        c = coberturaDia(d);
      const detalleDia = `${c.manana} turno mañana · ${c.tarde} turno tarde${feriado ? ` · ${feriado}` : ""}`;
      return `<th class="${finde ? "fin-semana" : ""} ${feriado ? "dia-feriado" : ""} ${esHoy(d) ? "dia-hoy" : ""} ${d === diaSeleccionado ? "dia-seleccionado" : ""}" data-horarios-dia="${d}" title="${escAttr(detalleDia)}"><span>${esc(nombreDia(d))}</span><strong>${d}</strong>${feriado ? '<small class="feriado-mini" aria-label="Feriado" title="Feriado">F</small>' : ""}<small class="cobertura-mini"><b>☀${c.manana}</b><b>☾${c.tarde}</b></small></th>`;
    },
  ).join("")}</tr>`;
  const empleadosTabla = empleadosVisiblesEnTabla();
  body.innerHTML = empleadosTabla.length
    ? empleadosTabla
        .map(
          (e) => {
            const sectorNombre = sectorSeleccionado()?.nombre || "";
            const inicialesEmpleado =
              String(e || "?").trim().charAt(0).toUpperCase() || "?";
            return `<tr><th class="empleado-col"><span class="empleado-cell-inner"><span class="empleado-avatar">${esc(inicialesEmpleado)}</span><span class="empleado-info"><strong>${esc(e)}</strong><small>${esc(sectorNombre)}</small></span></span></th>${Array.from(
              { length: diasDelMes() },
              (_, i) => {
                const d = i + 1,
                  feriado = obtenerFeriadoDia(d),
                  id = obtenerTurno(e, d),
                  t = obtenerDefinicion(id),
                  sel = seleccion.has(keyCelda(e, d));
                const detalle = detalles.get(keyCelda(e, d));
                const marcas = `${detalle?.observacion || detalle?.motivo ? '<i class="horario-nota-dot" title="Tiene observación"></i>' : ""}`;
                return `<td class="${feriado ? "dia-feriado" : ""} ${esHoy(d) ? "dia-hoy" : ""} ${d === diaSeleccionado ? "dia-seleccionado" : ""} ${sel ? "celda-seleccionada" : ""}" data-empleado="${escAttr(e)}" data-dia="${d}" ${feriado ? `title="${escAttr(feriado)}"` : ""}><button type="button" class="horario-cell ${escAttr(t.clase)}" style="${escAttr(t.estilo || "")}" data-tooltip="${escAttr(t.label)}">${esc(formatoCelda(id))}${marcas}</button></td>`;
              },
            ).join("")}</tr>`;
          },
        )
        .join("")
    : `<tr><td colspan="${diasDelMes() + 1}" class="horarios-sin-empleados"><strong>No hay personal asignado a este sector</strong><span>Asigná usuarios desde Administrador → Usuarios.</span></td></tr>`;
  head.querySelectorAll("[data-horarios-dia]").forEach(
    (x) =>
      (x.onclick = () => {
        diaSeleccionado = Number(x.dataset.horariosDia);
        renderTabla();
        renderResumen();
      }),
  );
  body.querySelectorAll("td[data-empleado]").forEach((td) => {
    td.onpointerdown = (ev) => {
      if (
        !puedeEditar() ||
        !modoEdicion ||
        (ev.pointerType === "mouse" && ev.button !== 0)
      )
        return;
      const emp = td.dataset.empleado,
        dia = Number(td.dataset.dia);
      punteroSeleccion = {
        id: ev.pointerId,
        tipo: ev.pointerType,
        x: ev.clientX,
        y: ev.clientY,
        empleado: emp,
        dia,
        movio: false,
      };
      seleccionInicio = { empleado: emp, dia };
      // Cada nuevo arrastre se suma a la selección existente. La selección solo
      // se reinicia mediante “Limpiar selección” o al salir del modo de edición.
      seleccionBaseArrastre = new Set(seleccion);
      if (ev.pointerType !== "touch") ev.preventDefault();
    };
    td.ondblclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
  });
  const w = document.querySelector("#horariosEquipoView .horarios-table-wrap");
  if (w && !w.dataset.cfg) {
    w.dataset.cfg = "1";
    w.addEventListener("scroll", actualizarColumnaEmpleados, { passive: true });
  }
  actualizarColumnaEmpleados();
}
document.addEventListener(
  "pointermove",
  (ev) => {
    if (
      !punteroSeleccion ||
      ev.pointerId !== punteroSeleccion.id ||
      !modoEdicion
    )
      return;
    const distancia = Math.hypot(
      ev.clientX - punteroSeleccion.x,
      ev.clientY - punteroSeleccion.y,
    );
    const umbral = punteroSeleccion.tipo === "touch" ? 18 : 6;
    if (distancia < umbral) return;
    punteroSeleccion.movio = true;
    if (punteroSeleccion.tipo === "touch") return;
    ev.preventDefault();
    const td = celdaDesdePunto(ev.clientX, ev.clientY);
    if (td) seleccionarRango(td.dataset.empleado, Number(td.dataset.dia));
  },
  { passive: false },
);
document.addEventListener("pointerup", (ev) => {
  if (!punteroSeleccion || ev.pointerId !== punteroSeleccion.id) return;
  const p = punteroSeleccion;
  if (!p.movio) alternarCelda(p.empleado, p.dia);
  punteroSeleccion = null;
  seleccionInicio = null;
  seleccionBaseArrastre.clear();
});
document.addEventListener("pointercancel", () => {
  punteroSeleccion = null;
  seleccionInicio = null;
  seleccionBaseArrastre.clear();
});

function turnoDeHoyParaResumen(empleado, hoy) {
  const mesActualVisible =
    fechaVista.getFullYear() === hoy.getFullYear() &&
    fechaVista.getMonth() === hoy.getMonth();
  return mesActualVisible
    ? obtenerTurno(empleado, hoy.getDate())
    : resumenHoyDatos.get(claveResumenHoy(empleado)) || "";
}
function tarjetaTrabajadorHoy(empleado, horario) {
  const inicial = String(empleado || "?").trim().charAt(0).toUpperCase() || "?";
  return `<div class="horarios-trabajador-card"><span class="horarios-trabajador-avatar">${esc(inicial)}</span><div><strong>${esc(empleado)}</strong><small>${esc(horario)}</small></div></div>`;
}
function renderResumen() {
  const t = $("horariosDiaSeleccionado"),
    c = $("horariosResumenDia");
  if (!t || !c) return;
  const hoy = new Date();
  t.textContent = hoy.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const manana = [];
  const tarde = [];
  empleados.forEach((empleado) => {
    const id = turnoDeHoyParaResumen(empleado, hoy);
    const segmentos = segmentosDeTurno(id);
    if (!segmentos.length) return;

    const segmentosManana = segmentos.filter(
      (segmento) => Number(segmento.inicio.slice(0, 2)) < 14,
    );
    const segmentosTarde = segmentos.filter(
      (segmento) => Number(segmento.inicio.slice(0, 2)) >= 14,
    );
    const etiquetaSegmentos = (lista) =>
      lista
        .map((segmento) => `${segmento.inicio} - ${segmento.fin}`)
        .join(" / ");

    if (segmentosManana.length) {
      manana.push(
        tarjetaTrabajadorHoy(empleado, etiquetaSegmentos(segmentosManana)),
      );
    }
    if (segmentosTarde.length) {
      tarde.push(
        tarjetaTrabajadorHoy(empleado, etiquetaSegmentos(segmentosTarde)),
      );
    }
  });

  const vacio = '<div class="horarios-turno-vacio">No hay personal asignado en este turno.</div>';
  c.innerHTML = `
    <section class="horarios-turno-hoy horarios-turno-manana">
      <header><span class="horarios-turno-icon" aria-hidden="true">☀</span><div><strong>Turno mañana</strong><small>${manana.length} ${manana.length === 1 ? "persona" : "personas"}</small></div></header>
      <div class="horarios-trabajadores-grid">${manana.length ? manana.join("") : vacio}</div>
    </section>
    <section class="horarios-turno-hoy horarios-turno-tarde">
      <header><span class="horarios-turno-icon" aria-hidden="true">☾</span><div><strong>Turno tarde</strong><small>${tarde.length} ${tarde.length === 1 ? "persona" : "personas"}</small></div></header>
      <div class="horarios-trabajadores-grid">${tarde.length ? tarde.join("") : vacio}</div>
    </section>`;
  renderTarjetaMiHorario();
}
function normalizarIdentidadHorario(valor) {
  return String(valor || "")
    .trim()
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function resolverEmpleadoSesion(usuario) {
  const nombre = normalizarIdentidadHorario(usuario?.nombre);
  const usuarioId = normalizarIdentidadHorario(usuario?.usuario);
  return (
    [...new Set([...empleados, ...empleadosConfiguracion])].find((empleado) => {
      const info = empleadosInfo.get(empleado) || {};
      return (
        normalizarIdentidadHorario(empleado) === nombre ||
        normalizarIdentidadHorario(info.nombre) === nombre ||
        normalizarIdentidadHorario(info.usuario) === usuarioId
      );
    }) || ""
  );
}
function datosHorarioPersonalHoy() {
  const usuario = window.AutoservicioAuth?.getUsuario?.() || {};
  const empleado = resolverEmpleadoSesion(usuario);
  const hoy = new Date();
  const fechaTexto = hoy.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const mesHoy = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const turnoHoy = empleado
    ? resumenHoyDatos.get(claveResumenHoy(empleado)) ||
      obtenerTurnoEn(mesHoy, empleado, hoy.getDate()) ||
      ""
    : "";
  return {
    usuario,
    empleado,
    turnoHoy,
    horarioTexto: turnoHoy ? formatoHorario24(turnoHoy) : "Sin asignar",
    fechaTexto,
  };
}
function renderTarjetaMiHorario() {
  const card = $("horariosMiHorarioCard");
  if (!card) return;
  const { usuario, empleado, horarioTexto, fechaTexto } = datosHorarioPersonalHoy();
  const nombreCompleto = String(usuario?.nombre || usuario?.usuario || "Usuario").trim();
  const primerNombre = nombreCompleto.split(/\s+/)[0] || "Usuario";
  if ($("horariosMiHorarioSaludo"))
    $("horariosMiHorarioSaludo").textContent = `Hola, ${primerNombre}`;
  if ($("horariosMiHorarioHoy"))
    $("horariosMiHorarioHoy").textContent = empleado ? horarioTexto : "Sin horario asignado";
  if ($("horariosMiHorarioFecha"))
    $("horariosMiHorarioFecha").textContent = fechaTexto;
}
function capitalizarPrimeraHorario(texto) {
  const s = String(texto || "");
  return s ? s.charAt(0).toLocaleUpperCase("es-AR") + s.slice(1) : s;
}
function minutosHoraHorarioPersonal(valor) {
  const [h, m] = String(valor || "00:00").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
function duracionTurnoHoras(id) {
  return segmentosDeTurno(id).reduce((total, segmento) => {
    const inicio = minutosHoraHorarioPersonal(segmento.inicio);
    let fin = minutosHoraHorarioPersonal(segmento.fin);
    if (fin <= inicio) fin += 24 * 60;
    return total + Math.max(0, fin - inicio) / 60;
  }, 0);
}
function resumenMesHorarioPersonal(empleado) {
  const resumen = {
    trabajados: 0,
    franco: 0,
    licencia: 0,
    vacaciones: 0,
    ausente: 0,
    horas: 0,
  };
  if (!empleado) return resumen;
  for (let dia = 1; dia <= diasDelMes(); dia++) {
    const id = obtenerTurno(empleado, dia);
    if (!id) continue;
    if (id === "franco") resumen.franco++;
    else if (id === "licencia") resumen.licencia++;
    else if (id === "vacaciones") resumen.vacaciones++;
    else if (id === "ausente") resumen.ausente++;
    else {
      resumen.trabajados++;
      resumen.horas += duracionTurnoHoras(id);
    }
  }
  return resumen;
}
function etiquetaTurnoHorarioPersonal(id) {
  if (!id) return "Sin asignar";
  const definicion = obtenerDefinicion(id);
  if (["franco", "licencia", "vacaciones", "ausente"].includes(id))
    return definicion.label;
  return formatoHorario24(id);
}
function claseEstadoHorarioPersonal(id) {
  if (!id) return "mio-turno-empty";
  if (["franco", "licencia", "vacaciones", "ausente"].includes(id))
    return `mio-turno-${id}`;
  return "mio-turno-work";
}
function renderMiniCalendarioHorarioPersonal(empleado) {
  const contenedor = $("miHorarioMiniCalendario");
  if (!contenedor) return;
  const anio = fechaVista.getFullYear();
  const mes = fechaVista.getMonth();
  const primerDia = new Date(anio, mes, 1);
  const inicio = new Date(anio, mes, 1 - ((primerDia.getDay() + 6) % 7));
  const hoy = new Date();
  const celdas = [];
  for (let i = 0; i < 42; i++) {
    const fecha = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    const esMes = fecha.getMonth() === mes && fecha.getFullYear() === anio;
    const esHoyReal =
      fecha.getFullYear() === hoy.getFullYear() &&
      fecha.getMonth() === hoy.getMonth() &&
      fecha.getDate() === hoy.getDate();
    let id = "";
    if (esMes && empleado) id = obtenerTurno(empleado, fecha.getDate());
    const definicion = obtenerDefinicion(id);
    const color = definicion?.color || "#d0d5dd";
    celdas.push(
      `<span class="mio-mini-day${esMes ? "" : " is-outside"}${esHoyReal ? " is-today" : ""}${id ? " has-shift" : ""}"${id ? ` style="--mio-day-color:${escAttr(color)}" title="${escAttr(etiquetaTurnoHorarioPersonal(id))}"` : ""}>${fecha.getDate()}${id ? '<i aria-hidden="true"></i>' : ""}</span>`,
    );
  }
  contenedor.innerHTML = celdas.join("");
}
function renderMiHorario() {
  const { usuario, empleado: e, horarioTexto, fechaTexto: fechaHoyTexto } =
    datosHorarioPersonalHoy();
  const lista = $("miHorarioLista");
  if (!lista) return;

  const nombreCompleto = String(usuario?.nombre || usuario?.usuario || "Usuario").trim();
  const primerNombre = nombreCompleto.split(/\s+/)[0] || "Usuario";
  const saludo = document.querySelector("#horariosMioView .horarios-hoy-card-saludo");
  if (saludo) saludo.textContent = `Hola, ${primerNombre}`;
  if ($("miHorarioProximo"))
    $("miHorarioProximo").textContent = e ? horarioTexto : "Sin horario asignado";
  if ($("miHorarioProximoFecha"))
    $("miHorarioProximoFecha").textContent = fechaHoyTexto;
  if ($("miHorarioMesTexto"))
    $("miHorarioMesTexto").textContent = capitalizarPrimeraHorario(nombreMes());
  if ($("miHorarioResumenMes"))
    $("miHorarioResumenMes").textContent = capitalizarPrimeraHorario(nombreMes());

  const resumen = resumenMesHorarioPersonal(e);
  if ($("miHorarioDiasTrabajados")) $("miHorarioDiasTrabajados").textContent = resumen.trabajados;
  if ($("miHorarioFrancos")) $("miHorarioFrancos").textContent = resumen.franco;
  if ($("miHorarioLicencias")) $("miHorarioLicencias").textContent = resumen.licencia;
  if ($("miHorarioVacaciones")) $("miHorarioVacaciones").textContent = resumen.vacaciones;
  if ($("miHorarioAusencias")) $("miHorarioAusencias").textContent = resumen.ausente;
  if ($("miHorarioHorasEstimadas")) {
    const horas = Number.isInteger(resumen.horas)
      ? String(resumen.horas)
      : resumen.horas.toFixed(1).replace(".", ",");
    $("miHorarioHorasEstimadas").textContent = `${horas} h`;
  }
  renderMiniCalendarioHorarioPersonal(e);

  if (!e) {
    lista.innerHTML =
      '<div class="mio-empty-state"><span class="mio-empty-icon"><svg class="app-icon"><use href="#icon-calendar"></use></svg></span><div><strong>Sin horarios asignados</strong><span>Tu usuario no tiene turnos cargados para el mes seleccionado.</span></div></div>';
    return;
  }

  const hoy = new Date();
  const esMesDeHoy =
    fechaVista.getFullYear() === hoy.getFullYear() &&
    fechaVista.getMonth() === hoy.getMonth();
  const desde = esMesDeHoy ? hoy.getDate() + 1 : 1;
  const fechas = [];
  for (let dia = desde; dia <= diasDelMes() && fechas.length < 7; dia++) {
    fechas.push(new Date(fechaVista.getFullYear(), fechaVista.getMonth(), dia));
  }

  lista.innerHTML = fechas.length
    ? fechas
        .map((f) => {
          const id = obtenerTurno(e, f.getDate());
          const tr = obtenerDefinicion(id);
          const diaCorto = f
            .toLocaleDateString("es-AR", { weekday: "short" })
            .replace(".", "")
            .slice(0, 3)
            .toUpperCase();
          const diaLargo = capitalizarPrimeraHorario(
            f.toLocaleDateString("es-AR", { weekday: "long" }),
          );
          const mesLargo = f.toLocaleDateString("es-AR", { month: "long" });
          const clase = claseEstadoHorarioPersonal(id);
          return `<article class="mio-upcoming-item">
            <span class="mio-date-badge"><strong>${f.getDate()}</strong><small>${esc(diaCorto)}</small></span>
            <div class="mio-date-copy"><span>${esc(diaLargo)}</span><strong>${f.getDate()} de ${esc(mesLargo)}</strong></div>
            <span class="mio-turno-pill ${escAttr(clase)} ${escAttr(tr.clase || "")}" style="${escAttr(tr.estilo || "")}">${esc(etiquetaTurnoHorarioPersonal(id))}</span>
          </article>`;
        })
        .join("")
    : '<div class="mio-empty-state"><span class="mio-empty-icon"><svg class="app-icon"><use href="#icon-check"></use></svg></span><div><strong>Sin más horarios este mes</strong><span>No hay próximos días disponibles en el mes seleccionado.</span></div></div>';
}

function puedeAdministrarConfiguracion() {
  return puedeGestionarHorarios() && sectorSeleccionado()?.puedeEditar === true;
}
async function mostrarAvisoSinPermisoConfiguracion() {
  await dialogoHorarios({
    titulo: "Acceso a configuración no disponible",
    mensaje:
      "Tu usuario no tiene permisos para administrar la configuración de horarios. Podés consultar el calendario y tus turnos normalmente.",
    confirmar: "Volver al calendario",
    soloAceptar: true,
    variante: "permiso",
    kicker: "Horarios & Turnos",
  });
}
function crearBotonVolverHorarios() {
  const topbar = document.querySelector(".pro-topbar");
  if (!topbar) return null;

  let boton = $("btnHorariosVolver");
  if (boton) return boton;

  boton = document.createElement("button");
  boton.id = "btnHorariosVolver";
  boton.type = "button";
  boton.className = "horarios-back-topbar admin-header-back-btn oculto";
  boton.setAttribute("aria-label", "Volver Atrás al calendario de horarios");
  boton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  boton.addEventListener("click", async () => {
    const cambio = await cambiarVista("equipo");
    if (cambio !== false) window.scrollTo({ top: 0, behavior: "auto" });
  });
  topbar.appendChild(boton);
  return boton;
}

function aplicarVistaHorarios(v) {
  const eq = v === "equipo",
    mio = v === "mio",
    cfg = v === "config";
  document.body.classList.toggle("horarios-vista-calendario", eq);
  document.body.classList.toggle("horarios-vista-mio", mio);
  document.body.classList.toggle("horarios-vista-config", cfg);
  crearBotonVolverHorarios()?.classList.toggle("oculto", !(mio || cfg));
  $("horariosEquipoView")?.classList.toggle("oculto", !eq);
  $("horariosMiHorarioCard")?.classList.toggle("oculto", !eq);
  $("horariosMioView")?.classList.toggle("oculto", !mio);
  $("horariosConfigView")?.classList.toggle("oculto", !cfg);
  const titulosVista = eq
    ? ["Calendario", "Turnos del equipo"]
    : mio
      ? ["Mis horarios", "Consultá tu agenda laboral y próximos turnos."]
      : ["Configuración", "Administrar horarios"];
  if ($("horariosTituloVista"))
    $("horariosTituloVista").textContent = titulosVista[0];
  if ($("horariosSubtituloVista"))
    $("horariosSubtituloVista").textContent = titulosVista[1];
  const pageTitle = document.querySelector("#pantallaHorarios .horarios-page-header h1");
  const pageSubtitle = document.querySelector("#pantallaHorarios .horarios-page-header p");
  if (pageTitle)
    pageTitle.textContent = mio
      ? "Mis horarios"
      : cfg
        ? "Configuración de horarios"
        : "Horarios & Turnos";
  if (pageSubtitle)
    pageSubtitle.textContent = mio
      ? "Consultá tu agenda laboral y próximos turnos."
      : cfg
        ? "Administrá los horarios y el orden del equipo."
        : "Organizá los turnos del equipo y consultá el calendario mensual.";
  ubicarSelectorSectorSegunVista(v);
  renderSelectorSector();
  // El cuarto módulo (Modo lectura / Modo edición) forma parte de la estructura
  // del calendario. Los permisos solo ocultan el botón Editar.
  $("horariosEdicionMarco")?.classList.toggle("oculto", !eq);
  // Mis horarios y Configuración tienen composiciones propias. El deck general
  // del calendario no se reutiliza en esas vistas.
  $("horariosControlDeck")?.classList.toggle("oculto", mio || cfg);
}

async function cambiarVista(v) {
  if (v === "config" && !puedeAdministrarConfiguracion()) {
    await mostrarAvisoSinPermisoConfiguracion();
    return false;
  }
  if (vistaActual === "config" && v !== "config") {
    const puedeSalir = await confirmarDescartarOrdenConfig();
    if (!puedeSalir) return false;
  }
  if (v !== "equipo" && modoEdicion) {
    const salio = await salirModoEdicion();
    if (!salio) return false;
  }
  vistaActual = v;
  aplicarVistaHorarios(v);
  if (v === "mio") renderMiHorario();
  if (v === "config") renderConfiguracionHorarios();
  return true;
}
async function cambiarMes(n) {
  if (modoEdicion) {
    const salio = await salirModoEdicion();
    if (!salio) return false;
  }
  fechaVista = new Date(fechaVista.getFullYear(), fechaVista.getMonth() + n, 1);
  diaSeleccionado = esMesActual() ? new Date().getDate() : 1;
  seleccion.clear();
  await cargarCalendarioActual();
  await cargarResumenHoy();
  renderTodo();
  return true;
}
async function irAHoy() {
  if (modoEdicion) {
    const salio = await salirModoEdicion();
    if (!salio) return false;
  }
  const h = new Date();
  fechaVista = new Date(h.getFullYear(), h.getMonth(), 1);
  diaSeleccionado = h.getDate();
  await cambiarVista("equipo");
  await cargarCalendarioActual();
  await cargarResumenHoy(true);
  renderTodo();
  desplazarAlDia(diaSeleccionado);
  return true;
}
async function irAHoyMiHorario() {
  if (modoEdicion) {
    const salio = await salirModoEdicion();
    if (!salio) return false;
  }
  const h = new Date();
  fechaVista = new Date(h.getFullYear(), h.getMonth(), 1);
  diaSeleccionado = h.getDate();
  await cargarCalendarioActual();
  await cargarResumenHoy(true);
  renderTodo();
  return true;
}
function renderTodo() {
  if ($("horariosMesTexto"))
    $("horariosMesTexto").textContent = nombreMesControlCalendario();
  renderSelectorSector();
  actualizarSelectorTurnos();
  renderEtiquetaCalendario();
  renderTabla();
  renderResumen();
  renderTarjetaMiHorario();
  renderMiHorario();
  if (vistaActual === "config") renderConfiguracionHorarios();
  actualizarPermisos();
  actualizarAcciones();
}

const COLORES_TURNOS = [
  ["#dc2626", "Rojo"],
  ["#f97316", "Naranja"],
  ["#f59e0b", "Ámbar"],
  ["#eab308", "Amarillo"],
  ["#65a30d", "Lima"],
  ["#16a34a", "Verde"],
  ["#0f766e", "Verde azulado"],
  ["#0891b2", "Cian"],
  ["#2563eb", "Azul"],
  ["#4f46e5", "Índigo"],
  ["#7c3aed", "Violeta"],
  ["#c026d3", "Magenta"],
];
const MAPA_COLORES_ANTERIORES = {
  "#db2777": "#c026d3",
  "#64748b": "#2563eb",
  "#92400e": "#f97316",
  "#111827": "#2563eb",
  "#84cc16": "#65a30d",
  "#14b8a6": "#0f766e",
};
function colorTurnoPermitido(color) {
  const c = String(color || "").toLowerCase();
  return COLORES_TURNOS.some(([hex]) => hex === c)
    ? c
    : MAPA_COLORES_ANTERIORES[c] || "#f97316";
}
let turnoConfigEditando = null;
let ordenPersonalInicial = [];
let ordenSectorInicial = "";
function mensajeConfig(id, texto, tipo = "ok") {
  const el = $(id);
  if (!el) return;
  el.textContent = texto;
  el.className = `admin-message ${tipo}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.textContent = "";
    el.className = "admin-message";
  }, 3500);
}
function nombreColorTurno(hex) {
  return (
    COLORES_TURNOS.find(
      (x) => x[0].toLowerCase() === String(hex).toLowerCase(),
    )?.[1] || "Personalizado"
  );
}
function contrasteTurno(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16),
    r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111827" : "#fff";
}
function renderPaletaTurno(color) {
  const pal = $("horariosTurnoColorPalette");
  if (!pal) return;
  $("horariosTurnoColor").value = color;
  $("horariosTurnoColorNombre").textContent = nombreColorTurno(color);
  pal.innerHTML = COLORES_TURNOS.map(
    ([hex, n]) =>
      `<button type="button" class="admin-color-option ${hex === color ? "seleccionado" : ""}" data-color="${hex}" aria-label="${n}"><span style="background:${hex}"></span></button>`,
  ).join("");
  pal
    .querySelectorAll("button")
    .forEach((b) =>
      b.addEventListener("click", () => renderPaletaTurno(b.dataset.color)),
    );
}
function actualizarCamposTurnoCortado() {
  const cortado = $("horariosTurnoCortado")?.checked === true;
  $("horariosTurnoSegundoTramo")?.classList.toggle("oculto", !cortado);
  if (!cortado) {
    $("horariosTurnoInicio2").value = "";
    $("horariosTurnoFin2").value = "";
  }
}
function abrirTurnoConfig(turno = null) {
  turnoConfigEditando = turno;
  $("horariosTurnoModalTitulo").textContent = turno
    ? "Editar horario"
    : "Nuevo horario";
  $("horariosTurnoOriginal").value = turno?.id || "";
  $("horariosTurnoInicio").value = turno?.inicio || "08:00";
  $("horariosTurnoFin").value = turno?.fin || "12:00";
  $("horariosTurnoCortado").checked = turno?.tipo === "cortado";
  $("horariosTurnoInicio2").value = turno?.inicio2 || "16:00";
  $("horariosTurnoFin2").value = turno?.fin2 || "20:00";
  actualizarCamposTurnoCortado();
  renderPaletaTurno(colorTurnoPermitido(turno?.color));
  $("btnHorariosEliminarTurno").classList.toggle("oculto", !turno);
  $("horariosTurnoModal").classList.remove("oculto");
  $("horariosTurnoModal").setAttribute("aria-hidden", "false");
}
function cerrarTurnoConfig() {
  $("horariosTurnoModal")?.classList.add("oculto");
  $("horariosTurnoModal")?.setAttribute("aria-hidden", "true");
  turnoConfigEditando = null;
}
function detalleTurnoConfig(t) {
  return t.tipo === "cortado"
    ? `${t.inicio} - ${t.fin} / ${t.inicio2} - ${t.fin2}`
    : `${t.inicio} - ${t.fin}`;
}
function renderListaTurnosConfig() {
  const cont = $("horariosConfigLista");
  if (!cont) return;
  const items = window.AutoservicioHorariosConfig?.cargar?.(sectorActual) || [];
  cont.innerHTML = items.length
    ? items
        .map(
          (t) =>
            `<article class="horarios-config-shift-row" data-id="${escAttr(t.id)}"><span class="horarios-config-shift-swatch" style="background:${escAttr(t.color)};color:${escAttr(contrasteTurno(t.color))}">${esc(t.tipo === "cortado" ? "C" : t.inicio.slice(0, 2))}</span><div class="horarios-config-shift-info"><strong>${esc(detalleTurnoConfig(t))}</strong><span>${esc(t.tipo === "cortado" ? "Horario cortado · " : "Turno continuo · ")}${esc(nombreColorTurno(t.color))}</span></div><button class="horarios-config-edit-shift" type="button"><svg class="app-icon" aria-hidden="true"><use href="#icon-edit"></use></svg><span>Editar</span></button></article>`,
        )
        .join("")
    : '<div class="empty-state">Todavía no hay horarios configurados.</div>';
  cont
    .querySelectorAll("[data-id] .horarios-config-edit-shift")
    .forEach((b) =>
      b.addEventListener("click", () =>
        abrirTurnoConfig(
          items.find((t) => t.id === b.closest("[data-id]").dataset.id),
        ),
      ),
    );
}
async function guardarTurnoConfig() {
  const inicio = $("horariosTurnoInicio").value,
    fin = $("horariosTurnoFin").value,
    color = $("horariosTurnoColor").value,
    original = $("horariosTurnoOriginal").value,
    cortado = $("horariosTurnoCortado").checked,
    inicio2 = cortado ? $("horariosTurnoInicio2").value : "",
    fin2 = cortado ? $("horariosTurnoFin2").value : "";
  let items = window.AutoservicioHorariosConfig?.cargar?.(sectorActual) || [];
  if (!inicio || !fin)
    return mensajeConfig(
      "horariosConfigMensaje",
      "Completá el primer tramo.",
      "error",
    );
  if (inicio === fin)
    return mensajeConfig(
      "horariosConfigMensaje",
      "El inicio y el final no pueden ser iguales.",
      "error",
    );
  if (cortado && (!inicio2 || !fin2))
    return mensajeConfig(
      "horariosConfigMensaje",
      "Completá el segundo tramo.",
      "error",
    );
  if (cortado && inicio2 === fin2)
    return mensajeConfig(
      "horariosConfigMensaje",
      "El segundo tramo no puede comenzar y terminar a la misma hora.",
      "error",
    );
  if (cortado && !(inicio < fin && fin < inicio2 && inicio2 < fin2))
    return mensajeConfig(
      "horariosConfigMensaje",
      "Los tramos deben estar ordenados y separados, por ejemplo 08:00–12:00 y 16:00–20:00.",
      "error",
    );
  if (!cortado && inicio >= fin)
    return mensajeConfig(
      "horariosConfigMensaje",
      "La hora de finalización debe ser posterior al inicio.",
      "error",
    );
  if (
    items.some(
      (t) =>
        t.inicio === inicio &&
        t.fin === fin &&
        (t.inicio2 || "") === inicio2 &&
        (t.fin2 || "") === fin2 &&
        t.id !== original,
    )
  )
    return mensajeConfig(
      "horariosConfigMensaje",
      "Ese horario ya existe.",
      "error",
    );
  const nuevo = {
    tipo: cortado ? "cortado" : "continuo",
    inicio,
    fin,
    inicio2,
    fin2,
    color,
  };
  if (original) {
    items = items.map((t) => (t.id === original ? { ...t, ...nuevo } : t));
  } else
    items.push({
      id: window.AutoservicioHorariosConfig.idDesdeHoras(
        inicio,
        cortado ? fin2 : fin,
      ),
      ...nuevo,
    });
  try {
    await window.AutoservicioHorariosConfig.guardar(items, sectorActual);
    cerrarTurnoConfig();
    renderListaTurnosConfig();
    cargarTurnosConfigurados();
    renderTodo();
    mensajeConfig(
      "horariosConfigMensaje",
      original ? "Horario actualizado." : "Horario agregado.",
    );
  } catch (e) {
    mensajeConfig("horariosConfigMensaje", e.message, "error");
  }
}
async function eliminarTurnoConfig() {
  const id = $("horariosTurnoOriginal").value;
  let items = window.AutoservicioHorariosConfig?.cargar?.(sectorActual) || [];
  if (window.HorariosApp?.turnosEnUso?.().includes(id))
    return mensajeConfig(
      "horariosConfigMensaje",
      "No se puede eliminar porque está asignado en el mes visible.",
      "error",
    );
  items = items.filter((t) => t.id !== id);
  if (!items.length)
    return mensajeConfig(
      "horariosConfigMensaje",
      "Debe quedar al menos un horario.",
      "error",
    );
  try {
    await window.AutoservicioHorariosConfig.guardar(items, sectorActual);
    cerrarTurnoConfig();
    renderListaTurnosConfig();
    cargarTurnosConfigurados();
    renderTodo();
    mensajeConfig("horariosConfigMensaje", "Horario eliminado.");
  } catch (e) {
    mensajeConfig("horariosConfigMensaje", e.message, "error");
  }
}
function ordenPersonalModificado() {
  return (
    ordenSectorInicial === sectorActual &&
    JSON.stringify(empleadosConfiguracion) !== JSON.stringify(ordenPersonalInicial)
  );
}
function actualizarBotonGuardarOrden() {
  const modificado = ordenPersonalModificado();
  const boton = $("btnHorariosGuardarOrden");
  const estado = $("horariosOrdenEstado");
  if (boton) boton.disabled = !modificado;
  if (estado) {
    estado.textContent = modificado
      ? "Hay cambios de orden sin guardar."
      : "El orden está guardado.";
    estado.classList.toggle("is-pending", modificado);
  }
}
function prepararOrdenConfig() {
  if (ordenSectorInicial !== sectorActual) {
    ordenSectorInicial = sectorActual;
    ordenPersonalInicial = [...empleadosConfiguracion];
  }
  actualizarBotonGuardarOrden();
}
function restaurarOrdenConfigInicial() {
  if (ordenSectorInicial !== sectorActual) return;
  empleadosConfiguracion = [...ordenPersonalInicial];
  sincronizarPersonalVisible();
  actualizarBotonGuardarOrden();
}
async function confirmarDescartarOrdenConfig() {
  if (!ordenPersonalModificado()) return true;
  const descartar = await dialogoHorarios({
    titulo: "Orden sin guardar",
    mensaje:
      "Cambiaste el orden del personal. Si continuás, esos cambios se descartarán.",
    confirmar: "Descartar cambios",
    peligro: true,
    kicker: "Configuración de horarios",
  });
  if (!descartar) return false;
  restaurarOrdenConfigInicial();
  return true;
}
function actualizarIndicesOrdenConfig(cont = $("horariosOrdenLista")) {
  if (!cont) return;
  cont.querySelectorAll(".horarios-order-item").forEach((item, i) => {
    const indice = item.querySelector(".horarios-order-index");
    if (indice) indice.textContent = String(i + 1);
  });
}

function sincronizarOrdenPersonalDesdeDOM(cont = $("horariosOrdenLista")) {
  if (!cont) return;
  const nuevoOrden = [...cont.querySelectorAll(".horarios-order-item")]
    .map((item) => item.dataset.empleado)
    .filter(Boolean);
  if (nuevoOrden.length !== empleadosConfiguracion.length) return;
  empleadosConfiguracion = nuevoOrden;
  actualizarIndicesOrdenConfig(cont);
  actualizarBotonGuardarOrden();
}

function prepararArrastreOrdenConfig(cont) {
  if (!cont || cont.dataset.arrastreOrdenListo === "true") return;
  cont.dataset.arrastreOrdenListo = "true";
  let activo = null;

  const limpiarArrastre = (event = null) => {
    if (!activo || (event && event.pointerId !== activo.pointerId)) return;
    const { item, handle, pointerId } = activo;
    try {
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
    } catch {}
    item.classList.remove("is-dragging");
    item.removeAttribute("aria-grabbed");
    cont.classList.remove("is-reordering");
    activo = null;
    sincronizarOrdenPersonalDesdeDOM(cont);
  };

  cont.addEventListener("click", async (event) => {
    const boton = event.target.closest?.(".horarios-order-visibility");
    if (!boton || !cont.contains(boton) || boton.disabled) return;
    const nombre = boton.dataset.empleado || "";
    const info = empleadosInfo.get(nombre) || {};
    await actualizarVisibilidadEmpleadoConfig(
      nombre,
      info.visibleCalendario === false,
      boton,
    );
  });

  cont.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest?.(".horarios-order-drag-handle");
    if (!handle || !cont.contains(handle)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const item = handle.closest(".horarios-order-item");
    if (!item) return;
    activo = {
      item,
      handle,
      pointerId: event.pointerId,
      startY: event.clientY,
      movio: false,
    };
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {}
    event.preventDefault();
  });

  cont.addEventListener(
    "pointermove",
    (event) => {
      if (!activo || event.pointerId !== activo.pointerId) return;
      if (!activo.movio && Math.abs(event.clientY - activo.startY) < 5) return;
      activo.movio = true;
      const { item } = activo;
      item.classList.add("is-dragging");
      item.setAttribute("aria-grabbed", "true");
      cont.classList.add("is-reordering");
      const objetivo = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest?.(".horarios-order-item");
      if (objetivo && objetivo !== item && cont.contains(objetivo)) {
        const rect = objetivo.getBoundingClientRect();
        const antes = event.clientY < rect.top + rect.height / 2;
        cont.insertBefore(item, antes ? objetivo : objetivo.nextSibling);
        actualizarIndicesOrdenConfig(cont);
      }
      const borde = 84;
      if (event.clientY < borde) window.scrollBy(0, -12);
      else if (event.clientY > window.innerHeight - borde) window.scrollBy(0, 12);
      event.preventDefault();
    },
    { passive: false },
  );

  cont.addEventListener("pointerup", limpiarArrastre);
  cont.addEventListener("pointercancel", limpiarArrastre);

  // Teclado sin flechas visuales: el mismo handle permite reordenar con ↑/↓.
  cont.addEventListener("keydown", (event) => {
    const handle = event.target.closest?.(".horarios-order-drag-handle");
    if (!handle || !cont.contains(handle)) return;
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const item = handle.closest(".horarios-order-item");
    if (!item) return;
    const vecino =
      event.key === 'ArrowUp'
        ? item.previousElementSibling
        : item.nextElementSibling;
    if (!vecino?.classList.contains("horarios-order-item")) return;
    if (event.key === 'ArrowUp') cont.insertBefore(item, vecino);
    else cont.insertBefore(vecino, item);
    actualizarIndicesOrdenConfig(cont);
    sincronizarOrdenPersonalDesdeDOM(cont);
    handle.focus();
    event.preventDefault();
  });
}

function renderOrdenConfig() {
  const cont = $("horariosOrdenLista");
  if (!cont) return;
  prepararOrdenConfig();
  cont.innerHTML = empleadosConfiguracion
    .map((e, i) => {
      const info = empleadosInfo.get(e) || {};
      const visibleCalendario = usuarioVisibleEnCalendario(e);
      return `<article class="horarios-order-item ${visibleCalendario ? "" : "is-disabled"}" data-empleado="${escAttr(e)}">
        <span class="horarios-order-index">${i + 1}</span>
        <div class="horarios-order-info"><strong>${esc(e)}</strong><span>${info.rol === "supervisor" ? "Supervisor" : "Empleado"}</span></div>
        <button class="horarios-order-visibility ${visibleCalendario ? "is-enabled" : "is-disabled"}" type="button" data-empleado="${escAttr(e)}" aria-pressed="${visibleCalendario ? "true" : "false"}" aria-label="${visibleCalendario ? `Ocultar a ${escAttr(e)} del calendario` : `Mostrar a ${escAttr(e)} en el calendario`}" title="${visibleCalendario ? "Ocultar del calendario" : "Volver a mostrar en el calendario"}">
          <span class="horarios-order-visibility-copy">
            <span class="horarios-order-visibility-label">Estado</span>
            <span class="horarios-order-visibility-value"><span class="horarios-order-visibility-long">${visibleCalendario ? "Visible en calendario" : "Oculto del calendario"}</span><span class="horarios-order-visibility-short">${visibleCalendario ? "Visible" : "Oculto"}</span></span>
          </span>
          <span class="horarios-order-visibility-switch" aria-hidden="true"><i></i></span>
        </button>
        <button class="horarios-order-drag-handle" type="button" aria-label="Arrastrar ${escAttr(e)} para cambiar su posición" title="Arrastrar para reordenar"><span aria-hidden="true"></span></button>
      </article>`;
    })
    .join("");
  prepararArrastreOrdenConfig(cont);
  actualizarBotonGuardarOrden();
}

async function actualizarVisibilidadEmpleadoConfig(nombre, visibleCalendario, boton) {
  if (!nombre || !puedeAdministrarConfiguracion()) return;
  if (boton) boton.disabled = true;
  try {
    const r = await fetch(`${API_BASE_URL}/horarios/personal-visibilidad`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // visibleCalendario es el único estado interno. `habilitado` se envía
      // únicamente como alias del contrato API vigente.
      body: JSON.stringify({
        sector: sectorActual,
        empleado: nombre,
        visibleCalendario,
        habilitado: visibleCalendario,
      }),
    });
    const d = await r.json();
    if (!r.ok || !d.ok)
      throw new Error(d.mensaje || "No se pudo actualizar el usuario");

    const info = empleadosInfo.get(nombre);
    if (info) info.visibleCalendario = visibleCalendario;
    const sector = sectorSeleccionado();
    const infoSector = sector?.empleadosInfo?.find((x) => x.nombre === nombre);
    if (infoSector) {
      infoSector.visibleCalendario = visibleCalendario;
      delete infoSector.habilitadoCalendario;
    }
    sincronizarPersonalVisible();
    seleccion.clear();
    renderOrdenConfig();
    renderTabla();
    renderResumen();
    renderTarjetaMiHorario();
    mensajeConfig(
      "horariosOrdenMensaje",
      visibleCalendario
        ? `${nombre} vuelve a mostrarse en el calendario.`
        : `${nombre} quedó oculto y ya no aparece en el calendario.`,
    );
  } catch (e) {
    if (boton) boton.disabled = false;
    mensajeConfig("horariosOrdenMensaje", e.message, "error");
  }
}

async function guardarOrdenConfig() {
  if (!ordenPersonalModificado()) return;
  const boton = $("btnHorariosGuardarOrden");
  if (boton) boton.disabled = true;
  try {
    const r = await fetch(`${API_BASE_URL}/horarios/orden`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sector: sectorActual, orden: empleadosConfiguracion }),
    });
    const d = await r.json();
    if (!r.ok || !d.ok)
      throw new Error(d.mensaje || "No se pudo guardar el orden");
    ordenPersonalInicial = [...empleadosConfiguracion];
    ordenSectorInicial = sectorActual;
    sincronizarPersonalVisible();
    renderTabla();
    actualizarBotonGuardarOrden();
    mensajeConfig("horariosOrdenMensaje", "Orden guardado correctamente.");
  } catch (e) {
    actualizarBotonGuardarOrden();
    mensajeConfig("horariosOrdenMensaje", e.message, "error");
  }
}
function renderConfiguracionHorarios() {
  if (!puedeAdministrarConfiguracion()) return;
  ubicarSelectorSectorSegunVista("config");
  renderSelectorSector();
  renderListaTurnosConfig();
  renderOrdenConfig();
}

function configurarEventos() {
  crearBotonVolverHorarios();
  crearControlConfiguracionCalendario();
  crearControlesEdicionCalendario();
  crearSelectorSector();
  organizarControlesCalendario();
  $("btnHorariosMesAnterior")?.addEventListener("click", () => cambiarMes(-1));
  $("btnHorariosMesSiguiente")?.addEventListener("click", () => cambiarMes(1));
  $("btnHorariosHoyToolbar")?.addEventListener("click", irAHoy);
  $("btnMiHorarioMesAnterior")?.addEventListener("click", () => cambiarMes(-1));
  $("btnMiHorarioMesSiguiente")?.addEventListener("click", () => cambiarMes(1));
  $("btnMiHorarioHoy")?.addEventListener("click", irAHoyMiHorario);
  $("horariosMiHorarioCard")?.addEventListener("click", () => cambiarVista("mio"));
  $("btnHorariosNuevoTurno")?.addEventListener("click", () =>
    abrirTurnoConfig(),
  );
  $("btnHorariosGuardarTurno")?.addEventListener("click", guardarTurnoConfig);
  $("horariosTurnoCortado")?.addEventListener(
    "change",
    actualizarCamposTurnoCortado,
  );
  $("btnHorariosEliminarTurno")?.addEventListener("click", eliminarTurnoConfig);
  $("btnHorariosCancelarTurno")?.addEventListener("click", cerrarTurnoConfig);
  $("btnHorariosGuardarOrden")?.addEventListener("click", guardarOrdenConfig);
  $("horariosTurnoModal")?.addEventListener("click", (e) => {
    if (e.target.id === "horariosTurnoModal") cerrarTurnoConfig();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modoEdicion) salirModoEdicion();
  });
  window.addEventListener("autoservicio:sesion", async () => {
    actualizarPermisos();
    if (vistaActual === "config" && !puedeAdministrarConfiguracion()) {
      restaurarOrdenConfigInicial();
      await cambiarVista("equipo");
    }
    renderTarjetaMiHorario();
    renderMiHorario();
  });
}
let moduloHorariosActivo = false;

function activar() {
  if (!moduloHorariosActivo) moduloHorariosActivo = true;

  // La vista y sus clases deben existir antes del primer render. El diseño
  // moderno del calendario depende de horarios-vista-calendario y no debe
  // esperar a un segundo ingreso para quedar sincronizado.
  vistaActual = "equipo";
  organizarControlesCalendario();
  aplicarVistaHorarios("equipo");
  renderTodo();

  requestAnimationFrame(() => {
    organizarControlesCalendario();
    actualizarColumnaEmpleados();
    if (esMesActual()) desplazarAlDia(new Date().getDate(), "auto");
  });
}
function reiniciarModuloHorarios() {
  if (hayCambiosPendientes()) {
    restaurarDatos(estadoInicialEdicion);
    restaurarDetalles(estadoInicialDetalles);
  }
  if (ordenPersonalModificado()) restaurarOrdenConfigInicial();
  salirModoEdicion(true);
  vistaActual = "equipo";
  seleccion.clear();
  cambiarVista("equipo");
  window.scrollTo({ top: 0, behavior: "auto" });
}
function desactivar() {
  if (!moduloHorariosActivo) return;
  reiniciarModuloHorarios();
  moduloHorariosActivo = false;
}

configurarEventos();
cargarContextoHorarios();
window.HorariosModule = {
  activar,
  desactivar,
  reiniciar: reiniciarModuloHorarios,
};

// Si la navegación abrió Horarios mientras este módulo todavía estaba cargando,
// la activación anterior no pudo encontrar window.HorariosModule. Al registrarse,
// sincroniza inmediatamente la vista ya visible. Esto elimina el primer render
// con estilos base y evita depender de entrar una segunda vez.
if (document.body.classList.contains("en-horarios")) activar();

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
    for (let d = 1; d <= diasDelMes(); d++)
      empleados.forEach((e) => usados.add(obtenerTurno(e, d)));
    return [...usados];
  },
  refrescarTurnos() {
    cargarTurnosConfigurados();
    renderTodo();
  },
};
window.addEventListener("autoservicio:horarios-config", (event) => {
  if (event.detail?.sector && event.detail.sector !== sectorActual) return;
  cargarTurnosConfigurados();
  renderTodo();
});

window.addEventListener("autoservicio:sesion", (event) => {
  if (modoEdicion) {
    restaurarDatos(estadoInicialEdicion);
    restaurarDetalles(estadoInicialDetalles);
    salirModoEdicion(true);
  }
  contextoHorariosCargado = false;
  horariosPeticiones.clear();
  empleados = [];
  empleadosConfiguracion = [];
  empleadosInfo = new Map();
  sectoresHorarios = [];
  sectorActual = "";
  detalles.clear();
  datos.clear();
  resumenHoyDatos = new Map();
  resumenHoyClave = "";
  if (event.detail?.usuario) void cargarContextoHorarios();
});
