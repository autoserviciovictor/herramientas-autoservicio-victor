const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const css = read('tareas-redesign.css');
const js = read('tareas.js');

function ok(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  }
}

ok(html.includes('<h1>Tareas Diarias</h1>'), 'la vista diaria debe titularse Tareas Diarias');
ok(!html.includes('JORNADA SELECCIONADA'), 'no debe quedar el eyebrow histórico Jornada seleccionada');
ok(html.includes('id="tareasResumen" class="tareas-kpi-grid"'), 'los KPI deben estar presentes antes de los controles');
ok(html.indexOf('id="tareasResumen"') < html.indexOf('class="tareas-command-bar"'), 'los KPI deben ubicarse antes de los filtros/controles');

ok(/\.tarea-check-row\.is-completed[\s\S]*?text-decoration:\s*none\s*!important/.test(css), 'las tareas completadas no deben usar tachado pesado');
ok(/\.config-toolbar-modern\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/.test(css), 'la barra de filtros de configuración debe ser limpia, sin marco pesado');
ok(/\.config-task-table-head,\s*\.config-task-row\s*\{[\s\S]*?grid-template-columns:\s*32px\s*minmax\(240px,\s*1\.45fr\)\s*110px\s*minmax\(240px,\s*1\.25fr\)\s*105px\s*60px/.test(css), 'configuración debe conservar asa de orden y cinco columnas de contenido');
ok(/#tareaModal \.tarea-modal-card > label\s*\{[\s\S]*?display:\s*grid\s*!important/.test(css), 'Nombre y Duración deben apilarse correctamente en Editar tarea');
ok(/#asignarModal \.assign-modal-card\s*\{[\s\S]*?max-width:\s*670px\s*!important/.test(css), 'el modal de asignación diaria debe usar el ancho profesional de referencia');
ok(/\.tareas-plan-modal-card\s*\{[\s\S]*?width:\s*min\(650px,\s*calc\(100vw - 40px\)\)/.test(css), 'el modal de planificación debe usar el ancho de referencia');
ok(!js.includes('Consultando el calendario…'), 'no debe quedar el placeholder visual Consultando el calendario');
ok(!js.includes('assign-user-summary'), 'la edición diaria no debe fijar un único responsable ni ocultar al resto del turno');
ok(js.includes('planResponsablesHTML(a, turno)'), 'la planificación debe renderizar responsables como chips individuales');

const legacyFiles = ['style.css', 'app-shell.css', 'design-components.css'];
const legacyRx = /body\.en-tareas|#pantallaTareas|#tareasVista|#tareaModal|#asignarModal|\.tareas-|\.tarea-|\.assign-|\.asignar-|data-tareas-tab/;
for (const file of legacyFiles) {
  ok(!legacyRx.test(read(file)), `${file} no debe contener reglas visuales históricas del módulo Tareas`);
}

const desktopCss = read('desktop-layout.css');
ok(desktopCss.includes('body.en-tareas main#pantallaTareas.pantalla.activa'), 'desktop-layout debe incluir Tareas únicamente en el eje canónico compartido');
ok(desktopCss.includes('body.en-tareas #pantallaTareas > .tareas-view > .tareas-shell'), 'el shell de Tareas debe compartir la caja exterior canónica con Horarios');
const taskMentionsDesktop = desktopCss.match(/body\.en-tareas[^,{]*/g) || [];
ok(taskMentionsDesktop.length <= 4, 'desktop-layout no debe volver a acumular reglas visuales específicas de Tareas');

if (!process.exitCode) console.log('Tareas visual referencia: OK');
