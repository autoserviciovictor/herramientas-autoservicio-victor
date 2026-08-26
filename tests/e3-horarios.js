const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const horarios = read("horarios.js");
const css = read("horarios-redesign.css");
const html = read("index.html");

// Calendario: todos los empleados del sector deben renderizarse sin recortes.
const visibles = horarios.match(/function empleadosVisiblesEnTabla\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
assert(visibles.includes("return empleados;"), "El calendario debe mostrar todos los empleados del sector");
assert(!visibles.includes("slice("), "El calendario no debe limitar la cantidad de empleados visibles");

// PERSONAL y compactación móvil: una sola etapa y una única inicial.
assert(horarios.includes('empleado-titulo-completo">PERSONAL</span>'), "La cabecera debe mostrar PERSONAL");
assert(horarios.includes('empleado-titulo-corto" aria-label="Personal">P</span>'), "La cabecera compacta debe mostrar P");
assert(horarios.includes('w.scrollLeft > 24'), "La compactación debe activarse al comenzar el desplazamiento horizontal");
assert(!horarios.includes("empleados-minimos"), "No debe quedar la segunda compactación histórica del personal");
assert(horarios.includes('String(e || "?").trim().charAt(0).toUpperCase()'), "Cada empleado debe compactarse a una única inicial");
assert(horarios.includes('id = "horariosTablaColumnas"') || horarios.includes('columnas.id = "horariosTablaColumnas"'), "La tabla debe declarar columnas explícitas para compactar PERSONAL de verdad");
assert(css.includes('.horarios-table.empleados-compactos .horarios-col-personal') && css.includes('width: 56px !important'), "La columna PERSONAL debe reducir su ancho al compactarse");
assert(css.includes('.horarios-table.empleados-compactos .empleado-info') && css.includes('display: none !important'), "La compactación debe ocultar nombre/sector y conservar la inicial");

// Título CALENDARIO centrado.
assert(horarios.includes('etiqueta.innerHTML = `<span>CALENDARIO</span>`'), "Debe existir el título CALENDARIO");
const labelRule = css.match(/\.horarios-calendar-labelbar\s*\{([\s\S]*?)\n\}/)?.[1] || "";
assert(labelRule.includes("place-items: center") && labelRule.includes("text-align: center"), "CALENDARIO debe quedar centrado");

// Scroll: escritorio completo; móvil solo horizontal y todas las filas en el flujo.
assert(css.includes('@media (min-width: 901px)') && css.includes('overflow-x: hidden !important'), "En PC el mes debe entrar sin scroll horizontal interno");
const mobileStart = css.indexOf('@media (max-width: 900px)');
const mobileCss = mobileStart >= 0 ? css.slice(mobileStart) : "";
assert(mobileCss.includes('overflow-x: auto !important'), "En móvil el calendario debe permitir desplazamiento horizontal");
assert(mobileCss.includes('overflow-y: visible !important'), "En móvil no debe existir scroll vertical interno");
assert(mobileCss.includes('max-height: none !important'), "En móvil la tabla no debe recortar empleados por altura");

// Lectura/edición: selector y tres acciones canónicas.
assert(horarios.includes('await abrirSelectorTurnos(evento)'), "Editar debe abrir el selector de horario");
assert(horarios.includes('if (modoEdicion) {\n    actualizarAcciones();\n    return true;'), "Editar debe permitir cambiar el horario manteniendo el modo edición");
assert(horarios.includes('id="horariosPaint"') && horarios.includes('>Pintar</strong>'), "Debe existir Pintar");
assert(horarios.includes('id="horariosSaveChanges"') && horarios.includes('>Guardar</strong>'), "Debe existir Guardar");
assert(horarios.includes('id="horariosCancelAll"') && horarios.includes('>Cancelar</strong>'), "Debe existir Cancelar");
assert(horarios.includes('seleccion.clear();\n  renderTodo();'), "Pintar debe desmarcar las casillas aplicadas");
assert(horarios.includes('$("horariosSaveChanges").disabled = !pendientes'), "Guardar debe habilitarse únicamente con cambios pendientes");
assert(horarios.includes('await salirModoEdicion(true);'), "Guardar/Cancelar deben volver al modo lectura");
assert(!horarios.includes('id="horariosModoDetalle"'), "El control no debe conservar el texto explicativo antiguo de modo");
assert(horarios.includes('id="horariosModoEstado"'), "El control debe mostrar únicamente Modo lectura / Modo edición");

// No volver a introducir el panel/acciones históricas del editor.
for (const legacy of ["horariosPanelEdicion", "horariosUndoOne", "horarios-editor", "Cancelar todo"]) {
  assert(!horarios.includes(legacy) && !css.includes(legacy), `Lógica vieja del calendario todavía presente: ${legacy}`);
}

// Sector, tarjeta roja y Trabajan hoy.
assert(css.includes('grid-template-columns: 36px auto minmax(0, 1fr)'), "Sector debe mantener etiqueta y selector correctamente alineados");
assert(css.includes('linear-gradient(115deg, #c91f35 0%, #e52d3d 54%, #f04960 100%)'), "Debe conservarse la tarjeta roja de horario de hoy");
assert(html.includes('<span>Trabajan hoy</span') && horarios.includes('<strong>Turno mañana</strong>') && horarios.includes('<strong>Turno tarde</strong>'), "Debe conservarse el resumen Trabajan hoy por mañana/tarde");

// La hoja de calendario debe ser una sola capa canónica, no otra cadena de parches.
assert((css.match(/ENTREGA 3 — HORARIOS & TURNOS \/ CALENDARIO CANÓNICO/g) || []).length === 1, "Debe existir una única sección canónica de Calendario");
assert(!css.includes("empleados-minimos"), "CSS no debe conservar reglas de compactación obsoletas");

console.log("Entrega 3 Horarios & Turnos regression tests: OK");
