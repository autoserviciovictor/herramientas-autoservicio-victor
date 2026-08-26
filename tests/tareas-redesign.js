const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const html = read('index.html');
const tareas = read('tareas.js');
const taskView = read('modules/tareas/task-view.js');
const css = read('tareas-redesign.css');
const legacyStyle = read('style.css');
const sw = read('service-worker.js');
const app = read('app.js');
const ui = read('ui.js');
const version = JSON.parse(read('version.json'));

// Arquitectura de navegación: Tareas conserva solo pantalla diaria + configuración;
// planificación se abre desde el botón y Baño queda como módulo independiente.
assert(html.includes('id="btnTareasPlanificacion"') && html.includes('Planificación semanal'),
  'La pantalla Tareas debe tener acceso directo a Planificación semanal');
assert(html.includes('id="btnTareasConfiguracion"') && html.includes('<span>Configuración</span>'),
  'La pantalla Tareas debe tener acceso directo a Configuración');
assert(!html.includes('data-tareas-tab="planificacion"'),
  'Planificación semanal no debe quedar como pestaña de navegación de Tareas');
assert(!html.includes('data-tareas-tab="bano"'),
  'Baño no debe quedar dentro de la navegación del módulo Tareas');
assert(html.includes('id="pantallaBano"') && html.includes('data-modulo="bano"'),
  'Baño debe existir como pantalla independiente y acceso rápido desde Inicio');
assert(ui.includes('bano: document.getElementById("pantallaBano")'),
  'Baño debe estar registrado como pantalla independiente');
assert(tareas.includes('window.BanoModule') && app.includes('window.BanoModule'),
  'La lógica de Baño debe exponerse y activarse independientemente');

// Configuración: exclusivamente tareas; baño queda fuera.
const tareasStart = html.indexOf('<main id="pantallaTareas"');
const banoStart = html.indexOf('<main id="pantallaBano"');
const configBano = html.indexOf('id="configPanelBano"');
assert(tareasStart >= 0 && banoStart > tareasStart && configBano > banoStart,
  'La configuración del baño debe estar fuera de pantallaTareas');
assert(!html.includes('id="btnConfigTabBano"') && !html.includes('id="btnConfigTabTareas"'),
  'Configuración de Tareas no debe conservar pestañas antiguas de Baño/Tareas');
assert(html.includes('id="configEstadoFiltro"') && html.includes('id="configDiaFiltro"'),
  'Configuración debe conservar filtros modernos por estado y día');
assert(!tareas.includes('configSubvista'),
  'No debe quedar estado JS antiguo para subvista de configuración de baño');

// Jerarquía diaria: contadores antes que barra de controles y grilla por turnos.
const resumenPos = html.indexOf('id="tareasResumen"');
const commandPos = html.indexOf('class="tareas-command-bar"');
const listaPos = html.indexOf('id="tareasLista"');
assert(resumenPos > tareasStart && resumenPos < commandPos && commandPos < listaPos,
  'Los KPI diarios deben aparecer arriba, antes de controles y tareas');
assert(css.includes('.tareas-kpi-grid') && css.includes('grid-template-columns: repeat(4'),
  'El rediseño debe usar una grilla superior de KPI');
assert(taskView.includes('tarea-user-progress-line') && taskView.includes('Editar tareas'),
  'Las tarjetas diarias deben conservar progreso y edición por persona');

// Planificación: semana completa, resumen superior y barra de controles limpia.
assert(html.includes('id="tareasPlanResumen"') && html.includes('id="tareasPlanGrid"'),
  'Planificación debe conservar resumen y grilla semanal');
assert(html.includes('id="btnPlanSemanaAnterior"') && html.includes('id="btnPlanSemanaSiguiente"'),
  'Planificación debe permitir navegar entre semanas');
assert(css.includes('.tareas-plan-row') && /repeat\(7,/.test(css),
  'La planilla debe mostrar siete columnas de días');
assert(tareas.includes('Array.from({ length: 7 }') || /for \(let i = 0; i < 7; i\+\+\)/.test(tareas),
  'La lógica semanal debe continuar generando los siete días');
assert(css.includes('.tareas-plan-toolbar'),
  'Planificación debe usar la barra de controles moderna');

// CSS canónico y responsive.
assert(html.includes('tareas-redesign.css'), 'index.html debe cargar el CSS canónico de Tareas');
assert(sw.includes('tareas-redesign.css'), 'Service Worker debe cachear el CSS canónico de Tareas');
assert(css.includes('html[data-theme="dark"]'), 'El rediseño debe soportar modo oscuro además del claro');
assert(css.includes('@media (max-width: 700px)'), 'El rediseño debe incluir adaptación móvil');
assert(!legacyStyle.includes('V9.3.2 — Navegación y estructura del módulo Tareas') &&
       !legacyStyle.includes('TAREAS 9.3.3 — PANTALLA PRINCIPAL') &&
       !legacyStyle.includes('TAREAS 10.0 — LISTA POR TURNOS Y TARJETAS COMPACTAS'),
  'Las capas visuales históricas reemplazadas deben eliminarse de style.css');

// Limpieza del error sintáctico encontrado en el archivo histórico.
assert(!/\n\s*\)\s*\{\s*\n\s*if\s*\(!puedeAsignar\(\)\)/.test(tareas),
  'No debe reaparecer el bloque huérfano histórico de tareas.js');

assert(/^1960-d21-/.test(version.assetBuild), 'Build de rediseño de Tareas inesperado');
console.log('Rediseño integral del módulo Tareas regression tests: OK');
