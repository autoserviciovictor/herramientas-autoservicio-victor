const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const components = read("design-components.css");
const style = read("style.css");
const horarios = read("horarios-redesign.css");
const version = JSON.parse(read("version.json"));

// Cargar producto: el diálogo no tiene scroll interno y el desplegable no altera el ancho.
const dialog = components.match(/\.product-loader-dialog \{([\s\S]*?)\n\}/)?.[1] || "";
assert(dialog.includes("max-height: none !important") && dialog.includes("overflow: visible !important"),
  "El modal Cargar producto no debe tener scroll interno");
const selectMenu = components.match(/\.app-select-custom__menu \{([\s\S]*?)\n\}/)?.[1] || "";
assert(selectMenu.includes("width: 100%") && selectMenu.includes("min-width: 0") && selectMenu.includes("max-width: 100%"),
  "El desplegable no debe modificar el ancho del modal");

// Calendario: se retiraron reglas históricas de hoy/selección que competían con el rediseño.
assert(!style.includes(".horarios-table th.dia-hoy,\n.horarios-table td.dia-hoy") &&
       !style.includes(".horarios-table .dia-seleccionado{\n  background-color:"),
  "No deben quedar fondos históricos compitiendo con el calendario actual");
assert(horarios.includes(".horarios-table .dia-feriado") && horarios.includes(".horarios-table .dia-hoy"),
  "Hoy y feriados deben seguir resaltando el fondo de la tabla");
assert(!/dia-(?:hoy|feriado)[^\{]*\.horario-cell\s*\{[^}]*background\s*:/s.test(horarios),
  "El resaltado contextual no debe pintar los cuadrados de turnos");

assert(/^1960-d21-/.test(version.assetBuild), "Build final inesperado");
console.log("Ajustes post-E5 ronda 4 regression tests: OK");
