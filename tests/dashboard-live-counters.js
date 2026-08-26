const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const html = read('index.html');
const app = read('app.js');
const admin = read('admin.js');
const server = read('server.js');
const css = read('ui-unification.css');

['inventario', 'vencimientos', 'horarios', 'tareas'].forEach((target) => {
  assert(html.includes(`data-dashboard-target="${target}"`), `Falta acceso KPI de Inicio a ${target}`);
});
assert(html.includes('id="proMetricTareasProgress"'), 'Falta progreso dinámico de tareas en Inicio');
assert(app.includes('async function actualizarResumenInicio'), 'Inicio debe actualizar contadores dinámicamente');
assert(app.includes('/dashboard/resumen'), 'Inicio debe intentar el endpoint agregado de resumen');
assert(app.includes('resumenInicioFallback'), 'Inicio debe conservar fallback para servidores anteriores');

assert(server.includes('app.get("/dashboard/resumen", requerirSesion'), 'Falta endpoint seguro /dashboard/resumen');
assert(server.includes('contarPersonalEnTurnoActual'), 'El resumen debe calcular personal en turno');
assert(server.includes('resumirTareasSemana'), 'El resumen debe calcular tareas semanales');

assert(html.includes('id="adminHomeVencimientosCard"'), 'Falta tarjeta navegable de vencimientos en Administración');
assert(html.includes('data-admin-kpi-target="vencimientos"'), 'La tarjeta de vencimientos debe navegar al módulo');
assert(!html.includes('id="adminHomeIrVencimientos"'), 'No debe quedar el botón Ver detalles del contador de vencimientos');
assert(!/Vencimientos hoy[\s\S]{0,250}Ver detalles/.test(html), 'El contador Vencimientos hoy no debe mostrar Ver detalles');
assert(admin.includes('data-admin-kpi-target'), 'Administración debe enlazar los KPI completos');
assert(admin.includes('fechaHoyArgentinaAdmin'), 'Administración debe tener fallback para vencimientos de servidores anteriores');
assert(css.includes('.app-kpi-action'), 'Los KPI navegables deben tener feedback visual y de foco');

console.log('Contadores dinámicos Inicio/Administración: OK');
