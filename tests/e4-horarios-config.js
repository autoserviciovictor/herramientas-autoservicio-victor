const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const horarios = read("horarios.js");
const css = read("horarios-redesign.css");
const style = read("style.css");
const html = read("index.html");

// Mis horarios: misma tarjeta roja literal + agenda + resumen mensual + mini calendario.
assert(
  (html.match(/horarios-hoy-card--shared/g) || []).length === 2,
  "Calendario y Mis horarios deben compartir literalmente la misma tarjeta roja",
);
for (const id of [
  "miHorarioMesTexto",
  "miHorarioLista",
  "miHorarioResumenMes",
  "miHorarioDiasTrabajados",
  "miHorarioFrancos",
  "miHorarioLicencias",
  "miHorarioVacaciones",
  "miHorarioAusencias",
  "miHorarioHorasEstimadas",
  "miHorarioMiniCalendario",
]) {
  assert(html.includes(`id="${id}"`), `Falta ${id} en Mis horarios`);
}
assert(horarios.includes("function renderMiniCalendarioHorarioPersonal"), "Falta render del mini calendario");
assert(horarios.includes("function resumenMesHorarioPersonal"), "Falta resumen mensual personal");
assert(
  css.includes("ENTREGA 4 — MIS HORARIOS / VISTA PERSONAL CANÓNICA"),
  "Mis horarios debe tener una única sección canónica de Entrega 4",
);
assert(
  css.includes("grid-template-columns: minmax(0, 1fr) 330px !important"),
  "Mis horarios PC debe mantener agenda + resumen en dos columnas",
);
assert(
  css.includes("body.en-horarios.horarios-vista-mio .mio-panel-grid") &&
    css.includes("grid-template-columns: 1fr !important"),
  "Mis horarios móvil debe pasar a una sola columna",
);

// Configuración: centrada, responsive, CRUD y navegación secundaria.
assert(
  css.includes("ENTREGA 4 — CONFIGURACIÓN DE HORARIOS CANÓNICA"),
  "Configuración debe tener una única sección canónica de Entrega 4",
);
assert(
  css.includes("body.en-horarios.horarios-vista-config #horariosConfigView") &&
    css.includes("width: 100% !important") &&
    css.includes("max-width: none !important"),
  "Configuración PC debe usar el mismo eje/ancho global que el resto de módulos",
);
assert(
  css.includes("body.en-horarios.horarios-vista-config .horarios-config-grid") &&
    css.includes("grid-template-columns: 1fr !important"),
  "Configuración móvil debe apilarse en una columna",
);
for (const fn of [
  "abrirTurnoConfig",
  "guardarTurnoConfig",
  "eliminarTurnoConfig",
  "renderListaTurnosConfig",
]) {
  assert(horarios.includes(`function ${fn}`) || horarios.includes(`async function ${fn}`), `Falta CRUD: ${fn}`);
}
assert(horarios.includes('"Ese horario ya existe."'), "El CRUD debe impedir horarios duplicados");
assert(horarios.includes('"Debe quedar al menos un horario."'), "El CRUD debe impedir borrar el último horario");

// Orden: Pointer Events para mouse/touch/pen, sin flechas visuales ni DnD HTML5 legado.
assert(horarios.includes('cont.dataset.arrastreOrdenListo === "true"'), "El orden debe instalar un único controlador delegado");
for (const eventName of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
  assert(horarios.includes(`"${eventName}"`), `Falta soporte ${eventName} para reordenar`);
}
assert(horarios.includes('event.pointerType === "mouse"'), "El drag debe distinguir mouse de touch/pen");
assert(css.includes("touch-action: none !important"), "El handle táctil debe reservar el gesto de arrastre");
assert(!horarios.includes('addEventListener("dragstart"') && !horarios.includes('addEventListener("drop"'), "No debe quedar DnD HTML5 antiguo");
for (const legacy of ["horarios-order-up", "horarios-order-down", "btnOrdenArriba", "btnOrdenAbajo"]) {
  assert(!horarios.includes(legacy) && !css.includes(legacy) && !html.includes(legacy), `No debe quedar control antiguo: ${legacy}`);
}
assert(horarios.includes("['ArrowUp', 'ArrowDown']"), "El handle debe permitir reordenar por teclado sin flechas visuales");

// Estado de visibilidad: una propiedad interna canónica.
assert(horarios.includes("function usuarioVisibleEnCalendario"), "Falta fuente única de visibilidad");
assert(horarios.includes("visibleCalendario"), "La propiedad canónica debe ser visibleCalendario");
assert(horarios.includes("delete info.habilitadoCalendario"), "El dato API antiguo debe normalizarse y eliminarse del estado interno");
assert(horarios.includes("sincronizarPersonalVisible()"), "Calendario y Configuración deben derivar de la misma visibilidad");
assert(horarios.includes("horarios-order-visibility-switch") && css.includes(".horarios-order-visibility-switch"), "El switch de visibilidad debe existir");

// Guardar orden: solo ante cambios reales y con protección al abandonar la vista.
assert(html.includes('id="btnHorariosGuardarOrden" type="button" disabled'), "Guardar orden debe iniciar deshabilitado");
assert(html.includes('id="horariosOrdenEstado"'), "Debe mostrarse el estado del orden");
assert(horarios.includes("boton.disabled = !modificado"), "Guardar orden debe depender únicamente de un cambio real");
assert(horarios.includes("function restaurarOrdenConfigInicial"), "Debe poder descartarse un orden local no guardado");
assert(horarios.includes("async function confirmarDescartarOrdenConfig"), "Salir/cambiar sector debe proteger cambios de orden pendientes");
assert(horarios.includes('titulo: "Orden sin guardar"'), "Debe advertirse antes de perder cambios de orden");

// Permisos: Configuración visible; Personal recibe cartel de acceso restringido.
assert(horarios.includes("function puedeAdministrarConfiguracion"), "La autorización de Configuración debe estar centralizada");
assert(horarios.includes('titulo: "Acceso a configuración no disponible"'), "Falta el nuevo cartel de acceso restringido");
assert(
  horarios.includes("Tu usuario no tiene permisos para administrar la configuración de horarios. Podés consultar el calendario y tus turnos normalmente."),
  "El mensaje de acceso restringido no coincide con el criterio definido",
);
assert(horarios.includes('confirmar: "Volver al calendario"'), "El cartel debe volver al calendario");
const permisos = horarios.match(/function actualizarPermisos\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
assert(
  permisos.includes('$("horariosConfigControl")?.classList.toggle') &&
    permisos.includes('vistaActual !== "equipo"'),
  "Configuración debe seguir visible en Calendario aun sin permisos de administración",
);
assert(
  !permisos.includes("puedeAdministrarConfiguracion"),
  "Los permisos no deben ocultar el acceso a Configuración: debe mostrar el cartel",
);

// Navegación móvil: Mis horarios y Configuración usan volver, no hamburguesa.
assert(
  css.includes("body.en-horarios.horarios-vista-mio #brandMenuBtn") &&
    css.includes("body.en-horarios.horarios-vista-config #brandMenuBtn") &&
    css.includes("display: none !important"),
  "Mis horarios/Configuración móvil deben reemplazar hamburguesa por volver",
);
assert(horarios.includes('boton.id = "btnHorariosVolver"'), "Debe existir una única acción Volver de Horarios");

// Limpieza: Mis horarios/Configuración ya no dependen de reglas históricas de style.css.
for (const legacySelector of [
  ".horarios-mio-view .mi-horario-stats",
  "#btnHorariosConfigNav",
  ".horarios-config-sin-permiso",
]) {
  assert(!style.includes(legacySelector), `style.css conserva una regla obsoleta: ${legacySelector}`);
}

console.log("Entrega 4 Mis horarios + Configuración regression tests: OK");
