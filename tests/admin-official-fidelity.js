const fs = require('fs');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const html = fs.readFileSync('index.html','utf8');
const js = fs.readFileSync('admin.js','utf8');
const css = fs.readFileSync('admin-official.css','utf8');

for (const id of [
  'adminUsuariosSeleccionarTodos','adminUsuariosAccionMasiva',
  'adminUsuariosVistaGrid','adminUsuariosVistaLista','adminHistorialPorPagina',
  'adminHistorialPaginacion','btnAdminVerHistorialSistema','btnAdminExportarConfig',
  'btnAdminSincronizar','btnAdminReportes'
]) assert(html.includes(`id="${id}"`), `Falta control de fidelidad ${id}`);

assert(html.includes('Productos en catálogo'), 'Sectores debe usar KPI de productos promedio como la referencia');
assert(html.includes('admin-system-utility-grid'), 'Sistema debe incluir bloque inferior de utilidades');
assert(html.includes('admin-history-filter-control'), 'Historial debe usar filtros visuales de la referencia');
assert(js.includes('aplicarAccionMasivaUsuarios'), 'Selección masiva de Usuarios debe ser funcional');
assert(js.includes('renderPaginacionHistorial'), 'Historial debe tener paginación real');
assert(js.includes('exportarRespaldoAdministrativo'), 'Respaldo administrativo debe ser funcional');
assert(css.includes('D22.1 · AUDITORÍA DE FIDELIDAD'), 'Falta capa visual de fidelidad D22.1');
assert(css.includes('1380px') && css.includes('.admin-system-utility-grid') && css.includes('.admin-history-total-card'), 'La escala y composición oficial no están completas');
console.log('Administración fidelidad visual D22.1: OK');
