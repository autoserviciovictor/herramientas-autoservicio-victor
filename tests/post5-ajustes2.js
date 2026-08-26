const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const style = read("style.css");
const components = read("design-components.css");
const tokens = read("design-tokens.css");
const horariosCss = read("horarios-redesign.css");
const horarios = read("horarios.js");
const version = JSON.parse(read("version.json"));

// 1 · Cargador compartido: centrado, sin overflow horizontal y estado compacto.
assert(components.includes('width: min(640px, calc(100vw - 48px)) !important'),
  "Cargar producto debe tener una única medida desktop");
assert(components.includes('max-height: none !important') && components.includes('overflow: visible !important'),
  "Cargar producto no debe usar scroll interno en el diálogo");
assert(components.includes('.product-loader-start.oculto { display: none !important; }'),
  "El bloque escáner/manual debe desaparecer realmente después de encontrar producto");
assert(components.includes('max-width: calc(100% - 48px) !important'),
  "Resultado y sección específica deben respetar el ancho interno del diálogo");

// 2 · Iconografía y dark mode del cargador desde tokens compartidos.
assert(components.includes('.product-loader-dialog .app-icon') && components.includes('stroke: currentColor !important'),
  "Los iconos del cargador deben heredar currentColor");
assert(components.includes('html[data-theme="dark"] .product-loader-symbol') &&
       components.includes('background: var(--pro-panel-2) !important'),
  "El cargador debe usar superficies oscuras canónicas");
assert(!components.includes('html[data-theme="dark"] .product-loader-dialog,\nhtml[data-theme="dark"] .product-loader-head,\nhtml[data-theme="dark"] .product-loader-specific {\n  background: #13243a'),
  "No debe quedar la paleta oscura antigua del cargador");

// 3 · Lista móvil: resumen y recientes comparten eje.
assert(style.includes('/* Eje móvil canónico: todos los bloques comparten exactamente el mismo ancho. */'),
  "Lista móvil debe tener un contrato de eje único");
for (const selector of ['.repo-summary-card', '.repo-recent-card']) {
  assert(style.includes(selector), `Falta ${selector} en el contrato móvil de Lista`);
}
assert(style.includes('justify-self: stretch !important'),
  "Listas recientes debe estirarse y quedar centrado en el eje móvil");

// 4 · Horarios: hoy azul, feriado rojo, sin recolorear los chips de turno.
assert(horarios.includes('FERIADOS_ARGENTINA_2026') && horarios.includes('dia-feriado'),
  "Horarios debe conservar detección de feriados");
assert(horariosCss.includes('background: color-mix(in srgb, #2563eb 22%') &&
       horariosCss.includes('background: color-mix(in srgb, #ef4444 20%'),
  "Hoy debe usar fondo azul y feriado fondo rojo");
assert(horariosCss.includes('html[data-theme="dark"] body.en-horarios.horarios-vista-calendario .horarios-table .dia-hoy') &&
       horariosCss.includes('html[data-theme="dark"] body.en-horarios.horarios-vista-calendario .horarios-table .dia-feriado'),
  "El resaltado debe ser visible también en oscuro");
assert(horariosCss.includes('td.dia-hoy, td.dia-feriado') && horariosCss.includes('isolation: isolate !important'),
  "Los turnos deben conservar su color semántico sobre el fondo contextual");

// 5 · Sector tiene la misma jerarquía que Configuración / Modo lectura.
const sectorRule = horariosCss.match(/\.horarios-sector-identidad > span \{([\s\S]*?)\n\}/)?.[1] || "";
assert(sectorRule.includes('font-size: 12px !important') &&
       sectorRule.includes('font-weight: 850 !important') &&
       sectorRule.includes('text-transform: none !important') &&
       sectorRule.includes('color: var(--horarios-text) !important'),
  "Sector debe usar la misma jerarquía tipográfica que los otros controles");

// 6 · Tema global: Inicio es la fuente de verdad para todos los módulos.
assert(tokens.includes('--ds-bg: #071321') && tokens.includes('--ds-surface: #122238') &&
       tokens.includes('--ds-surface-muted: #192d46'),
  "Dark mode debe usar los tokens canónicos de Inicio");
for (const screen of ['#pantallaVencimientos', '#pantallaAnotar', '#pantallaPrecios', '#pantallaAdmin', '#pantallaHorarios']) {
  assert(components.includes(screen), `${screen} debe participar del contrato visual global`);
}
const tareasCanonical = fs.readFileSync(path.join(root, 'tareas-redesign.css'), 'utf8');
assert(tareasCanonical.includes('body.en-tareas #pantallaTareas') && tareasCanonical.includes('background:'),
  '#pantallaTareas debe heredar el tema desde su hoja canónica tareas-redesign.css');
assert(components.includes('CONTRATO VISUAL CANÓNICO DE MÓDULOS'),
  "Debe existir una única autoridad visual para las superficies de módulos");
assert(!style.includes('AUTOSERVICIOAPP · INVENTARIO V15'),
  "La paleta oscura histórica V15 de Inventario debe estar eliminada");
assert(!style.includes('--venc-panel:#13243a') && !style.includes('--repo-dark-panel'),
  "No deben quedar paletas oscuras paralelas de Vencimientos/Lista");

// 7 · Inventario: patrón canónico azul → rojo → amarillo → verde.
for (const [n, color] of [[1,'#3b82f6'],[2,'#ef3340'],[3,'#f59e0b'],[4,'#10b981']]) {
  assert(style.includes(`.inventory-loaded-metrics article:nth-child(${n}){ --inventory-metric-accent: ${color}; }`),
    `Falta color semántico del contador ${n} de Inventario`);
}
assert(components.includes('border-color: color-mix(in srgb, var(--inventory-metric-accent) 72%'),
  "El marco de Inventario debe usar el mismo acento que su contador");

// 8 · Vencimientos: el borde del badge coincide exactamente con el texto.
const vencBadge = style.match(/#pantallaVencimientos \.venc-range-group__header > strong \{([\s\S]*?)\n\}/)?.[1] || "";
assert(vencBadge.includes('border:1px solid currentColor'),
  "El borde de los contadores de Vencimientos debe usar currentColor");
assert(!style.includes('venc-range-group--15 .venc-range-group__header > strong { border-color:'),
  "Las variantes no deben volver a imponer un borde blanco/pálido independiente");

// 9 · Scrollbars internos usan el mismo tema global.
assert(components.includes('scrollbar-color: var(--pro-border-strong, #405772) var(--pro-bg, #071321) !important'),
  "Scrollbars oscuros deben salir de los tokens globales");

// 10 · Build único para evitar mezclar CSS viejo con nuevo.
assert(/^1960-d21-/.test(version.assetBuild), "Build final inesperado");

console.log("Ajustes visuales post-E5 ronda 2 regression tests: OK");
