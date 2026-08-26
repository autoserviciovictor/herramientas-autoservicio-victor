const fs = require('fs');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const html = fs.readFileSync('index.html','utf8');
const js = fs.readFileSync('admin.js','utf8');
const css = fs.readFileSync('admin-official.css','utf8');
const sw = fs.readFileSync('service-worker.js','utf8');
const version = JSON.parse(fs.readFileSync('version.json','utf8'));

assert(html.includes('id="adminTab-inicio"'), 'Administración debe abrir con pantalla Inicio propia');
assert(!html.includes('id="adminTab-historial"'), 'Historial no debe seguir siendo una pantalla de Administración');
assert(html.includes('id="adminTab-inicio"'), 'Administración debe conservar su Inicio propio');
for (const vista of ['usuarios','sectores','sistema'])
  assert(html.includes(`data-admin-open="${vista}"`), `Falta acceso real ${vista} desde Inicio de Administración`);
assert(!html.includes('data-admin-tab='), 'No deben volver los botones internos legacy data-admin-tab');
assert(html.includes('id="btnVencHistorialHeader"') && html.includes('id="vencHistorialAdmin"'), 'Historial debe vivir dentro de Vencimientos');
assert(html.includes('id="btnVencHistorialMobile"'), 'Historial de Vencimientos debe conservar acceso móvil');
for (const id of ['adminUsuariosLista','adminSectoresLista','btnAdminNuevoUsuario','btnAdminNuevoSector','btnAdminActualizar','btnAdminImportarArchivo']) assert(html.includes(`id="${id}"`), `Se perdió función/elemento ${id}`);
for (const id of ['adminUsuarioNombre','adminUsuarioUsuario','adminUsuarioPassword','adminUsuarioRol','adminUsuarioSector','adminUsuarioPermisos','adminUsuarioActivo']) assert(html.includes(`id="${id}"`), `Editor de usuario incompleto: ${id}`);
for (const id of ['adminSectorNombre','adminSectorColor','adminSectorSupervisor','adminSectorActivo','btnAdminEliminarSector']) assert(html.includes(`id="${id}"`), `Editor de sector incompleto: ${id}`);
assert(js.includes('cambiarTab("inicio")'), 'Administración debe reiniciar en Inicio');
assert(js.includes('abrirHistorialVencimientosUI') && js.includes('/admin/historial-vencimientos'), 'Historial trasladado debe seguir usando la fuente real');
assert(js.includes('/admin/usuarios') && js.includes('/admin/sectores') && js.includes('/admin/importar-productos'), 'No se deben quitar APIs administrativas');
assert(css.includes('ADMINISTRACIÓN — DISEÑO OFICIAL') && css.includes('.admin-module-access-grid') && css.includes('.admin-history-venc-screen'), 'Falta hoja visual oficial');
assert(html.includes(`admin-official.css?v=${version.assetBuild}`), 'CSS oficial debe usar el build vigente');
assert(sw.includes(`admin-official.css?v=${version.assetBuild}`), 'CSS oficial debe quedar en el app shell offline');
console.log('Administración diseño oficial regression tests: OK');
