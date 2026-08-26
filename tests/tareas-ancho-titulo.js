const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const css = read('tareas-redesign.css');
const desktopCss = read('desktop-layout.css');
const js = read('tareas.js');
const unifiedCss = read('ui-unification.css');

function ok(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  }
}

ok(!html.includes('class="tareas-dashboard-icon"'), 'el título principal no debe conservar el icono que lo desplazaba respecto de Horarios');
ok(/\.tareas-dashboard-title h1\s*\{[\s\S]*?font-size:\s*28px;[\s\S]*?line-height:\s*1\.08;[\s\S]*?font-weight:\s*750;[\s\S]*?letter-spacing:\s*-\.035em;/.test(css), 'Tareas Diarias debe usar la misma escala tipográfica que Horarios');
ok(/\.tareas-dashboard-title p\s*\{[\s\S]*?margin:\s*6px 0 0;[\s\S]*?font-size:\s*14px;[\s\S]*?line-height:\s*1\.4;/.test(css), 'el subtítulo debe conservar la escala de Horarios');
ok(/\.tareas-eyebrow\s*\{[\s\S]*?font-size:\s*11px;[\s\S]*?font-weight:\s*800;[\s\S]*?letter-spacing:\s*\.14em;/.test(css), 'el eyebrow debe coincidir con los encabezados canónicos');

ok(/body\.en-inicio[\s\S]*?body\.en-horarios #pantallaHorarios > \.horarios-shell,[\s\S]*?body\.en-tareas #pantallaTareas > \.tareas-view > \.tareas-shell\s*\{[\s\S]*?max-width:\s*var\(--primary-module-max-width\)[\s\S]*?padding-left:\s*var\(--primary-module-inline-padding\)[\s\S]*?padding-right:\s*var\(--primary-module-inline-padding\)/.test(desktopCss), 'Tareas debe compartir exactamente la misma caja canónica que Horarios');
ok(!/max-width:\s*1200px/.test(css + desktopCss), 'no debe quedar el límite viejo de 1200 px en Tareas');

ok(/\.tareas-user-count-1,[\s\S]*?\.tareas-user-count-2,[\s\S]*?\.tareas-user-count-3,[\s\S]*?\.tareas-user-count-many\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*!important/.test(css), 'en escritorio cada tarjeta de persona debe conservar el ancho de una de tres columnas');

ok(js.includes('tareas-kpi is-total app-kpi-card app-kpi-blue'), 'Tareas del día debe usar el primer tono azul');
ok(js.includes('tareas-kpi is-complete app-kpi-card app-kpi-red'), 'Completadas debe usar el segundo tono rojo');
ok(js.includes('tareas-kpi is-pending app-kpi-card app-kpi-amber'), 'Pendientes debe usar el tercer tono amarillo');
ok(js.includes('tareas-kpi is-people app-kpi-card app-kpi-green'), 'Personas asignadas debe usar el cuarto tono verde');
ok(unifiedCss.includes('--app-kpi-height: 116px') && unifiedCss.includes('#pantallaTareas .tareas-kpi.app-kpi-card'), 'Tareas debe usar la altura canónica compartida de KPI');

ok(!html.includes('id="btnPlanVolverTareas"'), 'Planificación no debe conservar el botón Volver dentro del contenido');
ok(!html.includes('id="btnConfigVolverTareas"'), 'Configuración no debe conservar el botón Volver dentro del contenido');
ok(js.includes('btnTareasVolverTopbar'), 'Tareas debe crear el botón Volver en la topbar como Horarios');
ok(css.includes('.tareas-back-topbar'), 'el botón superior de Tareas debe tener estilos propios en la topbar');

if (!process.exitCode) console.log('Tareas ancho/título/contadores: OK');
