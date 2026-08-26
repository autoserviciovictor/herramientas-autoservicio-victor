const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const components = read("design-components.css");
const style = read("style.css");
const app = read("app.js");
const version = JSON.parse(read("version.json"));

// Rubro/select: no se recorta dentro del bloque específico y puede abrir hacia arriba.
assert(components.includes('overflow: visible !important') &&
       components.includes('.app-select-custom.opens-up .app-select-custom__menu'),
  "El selector de rubro no debe quedar recortado por el cargador");
assert(app.includes('function posicionarMenuSelectApp(wrapper)') &&
       app.includes('wrapper.classList.add("opens-up")'),
  "El select compartido debe reposicionarse cuando no hay espacio debajo");

// Acciones comunes: primario rojo + Cancelar delineado en rojo.
assert(components.includes('Acciones de carga: mismo contrato visual que Editar vencimiento') &&
       components.includes('.product-loader-actions .cancel-btn') &&
       components.includes('color: var(--pro-red, #f02246) !important'),
  "Los botones de carga deben compartir el diseño de Editar vencimiento");

// Inventario móvil: no vuelve a micro-tipografía.
assert(components.includes('.product-loader-specific .location-btn strong { font-size: 14px !important') &&
       components.includes('.product-loader-specific .location-btn small { font-size: 12px !important'),
  "Inventario móvil debe usar tipografía legible en ubicación/stock");

// Mi lista: acción inline roja incluso cuando está deshabilitada.
const repoBtn = style.match(/#pantallaAnotar \.repo-inline-new-list-btn \{([\s\S]*?)\n\}/)?.[1] || "";
assert(repoBtn.includes('background: var(--pro-red, #f02246)') && repoBtn.includes('color: #fff'),
  "Empezar nueva lista debe usar el rojo principal");

assert(/^1960-d21-/.test(version.assetBuild), "Build final inesperado");
console.log("Ajustes post-E5 ronda 3 regression tests: OK");
