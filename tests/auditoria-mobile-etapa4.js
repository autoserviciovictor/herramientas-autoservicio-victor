const fs = require('fs');
const assert = require('assert');

const read = (f) => fs.readFileSync(f, 'utf8');
const ui = read('ui-unification.css');
const style = read('style.css');
const components = read('design-components.css');
const tareas = read('tareas-redesign.css');
const horarios = read('horarios-redesign.css');
const version = JSON.parse(read('version.json'));

assert(ui.includes('--app-mobile-control-font: 14px;'), 'controles móviles no usan la escala 14px');
assert(ui.includes('--app-mobile-body-font: 13.5px;'), 'texto móvil no usa la escala 13.5px');
assert(ui.includes('--app-mobile-help-font: 12.5px;'), 'texto auxiliar móvil no usa la escala 12.5px');
assert(ui.includes('.app-choice-copy strong { font-size: 15px !important;'), 'selector compartido mantiene nombre pequeño');
assert(ui.includes('.app-choice-copy small { font-size: 12.5px !important;'), 'selector compartido mantiene texto auxiliar pequeño');
assert(ui.includes('.product-loader-search-row input,') && ui.includes('font-size: 14px !important;'), 'carga compartida no usa controles legibles');
assert(style.includes('#pantallaAnotar .repo-row-copy small { font-size:12px; }') || style.includes('#pantallaAnotar .repo-row-copy small { font-size: 12px !important;'), 'Reposición conserva microtipografía móvil');
assert(components.includes('.product-loader-specific .location-btn small { font-size: 12px !important'), 'carga de producto conserva microtipografía');
assert(tareas.includes('font-size: 12px !important;'), 'Tareas no recibió el piso tipográfico móvil');
assert(horarios.includes('font-size: 11.5px !important;'), 'Horarios no recibió el piso tipográfico compacto');
assert(/^1960-d21-[a-z0-9-]+$/.test(version.assetBuild), 'build D21 auditado inesperado');

console.log('OK auditoría móvil etapa 4: tipografía y legibilidad global normalizadas.');
