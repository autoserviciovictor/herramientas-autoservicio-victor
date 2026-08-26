const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const html = read('index.html');
const css = read('tareas-redesign.css');
const legacy = read('style.css');
const tareas = read('tareas.js');
const taskView = read('modules/tareas/task-view.js');
const version = JSON.parse(read('version.json'));

// P0: el CSS histórico ya no puede volver a controlar las vistas rediseñadas.
for (const forbidden of [
  '#tareasResumen',
  '#tareasVistaTareas',
  '#tareasVistaConfig',
  '.config-task-row',
  '.config-task-copy',
  '.config-task-icon',
  '.config-task-open',
  '.tarea-user-card',
  '.tarea-check-row',
  '.tareas-plan-grid',
  '.tareas-plan-row',
  '.tareas-plan-cell',
  '.tareas-plan-assignee',
]) {
  assert(!legacy.includes(forbidden), `style.css no debe conservar el selector histórico ${forbidden}`);
}

// Pantalla diaria: identidad + KPI visibles antes de los controles.
const head = html.indexOf('class="tareas-dashboard-head"');
const summary = html.indexOf('id="tareasResumen"');
const controls = html.indexOf('class="tareas-command-bar"');
assert(head >= 0 && head < summary && summary < controls,
  'Tareas debe mostrar encabezado interno, KPI y luego controles');
assert(css.includes('.tareas-dashboard-title h1') && css.includes('.tareas-kpi-grid'),
  'El CSS canónico debe contener el encabezado y KPI diarios');

// Tarjetas adaptativas según personas presentes.
assert(taskView.includes('tareas-user-count-${Math.min(groups.length, 3)}'),
  'La grilla por turno debe marcar la cantidad real de personas');
assert(css.includes('.tareas-turno-list.tareas-user-count-1') &&
       css.includes('.tareas-turno-list.tareas-user-count-2') &&
       css.includes('.tareas-turno-list.tareas-user-count-many'),
  'El CSS debe resolver 1, 2 y 3+ personas sin columnas fantasma');

// Configuración: cinco columnas reales y nombre horizontal.
assert(/grid-template-columns:\s*minmax\(280px,[^;]+110px[^;]+minmax\(280px,[^;]+105px 60px/.test(css),
  'Configuración debe conservar cinco columnas en escritorio');
assert(/\.config-task-name\s*\{[^}]*flex-direction:\s*row\s*!important/s.test(css),
  'El nombre de tarea debe permanecer horizontal');
assert(/@media \(max-width: 700px\)[\s\S]*\.config-task-table-head\s*\{\s*display:\s*none\s*!important/.test(css),
  'Configuración móvil debe transformarse a tarjetas');

// Planificación: todos los responsables deben renderizarse por separado, sin ellipsis.
assert(tareas.includes('planResponsablesHTML') && tareas.includes('tareas-plan-person'),
  'Planificación debe renderizar un elemento por responsable');
assert(!tareas.includes('function planNombreResponsables') && !tareas.includes('planNombreResponsables(a)'),
  'Planificación no debe volver a concatenar responsables en un único texto');
assert(/\.tareas-plan-person\s*\{[^}]*white-space:\s*normal/s.test(css),
  'Los nombres de responsables no deben truncarse por una sola línea');

assert(/^1960-d21-/.test(version.assetBuild), 'Build esperado para la corrección de Tareas');
console.log('Correcciones del rediseño de Tareas regression tests: OK');
