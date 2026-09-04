const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const server = read('server.js');
const db = read('db-catalogo-publico.js');
const html = read('index.html');
const app = read('app.js');
const auth = read('auth.js');
const ui = read('ui.js');
const js = read('catalogo-admin.js');
const css = read('catalogo-admin.css');

assert(server.includes('app.get("/admin/catalogo/estado"'), 'falta estado admin catalogo');
assert(server.includes('app.get("/admin/catalogo/productos"'), 'falta listado admin productos');
assert(server.includes('app.put("/admin/catalogo/productos/:codigo"'), 'falta edicion de producto');
assert(server.includes('app.patch("/admin/catalogo/productos/:codigo/visibilidad"'), 'falta toggle de visibilidad');
assert(server.includes('app.post("/admin/catalogo/rubros"'), 'falta alta de rubro');
assert(server.includes('app.put("/admin/catalogo/rubros/:id"'), 'falta edicion de rubro');
assert(server.includes('requerirAdministrador'), 'las rutas admin deben estar protegidas');

assert(db.includes('listarProductosCatalogoAdminDb'), 'falta consulta paginada admin');
assert(db.includes('LIMIT $'), 'el catalogo admin debe estar paginado');
assert(db.includes('actualizarProductoCatalogoAdminDb'), 'falta persistencia de producto');
assert(db.includes('crearRubroCatalogoAdminDb'), 'falta persistencia de rubros');

assert(html.includes('data-modulo="catalogo"'), 'falta Catalogo en menu');
assert(html.includes('id="pantallaCatalogoAdmin"'), 'falta pantalla Catalogo');
assert(html.includes('id="catalogProductoModal"'), 'falta editor de producto');
assert(html.includes('id="catalogRubroModal"'), 'falta editor de rubro');
assert(html.includes('Brindamos calidad y atención') || read('catalogo/index.html').includes('Brindamos calidad y atención'), 'debe conservar slogan oficial');
assert(!read('catalogo/index.html').toLowerCase().includes('tu barrio'), 'no debe reaparecer slogan anterior');

assert(auth.includes('["admin", "catalogo"].includes(modulo)'), 'Catalogo debe ser solo administrador');
assert(ui.includes('catalogo: document.getElementById("pantallaCatalogoAdmin")'), 'UI debe registrar pantalla');
assert(app.includes('window.CatalogoAdminModule?.activar?.()'), 'app debe activar modulo');
assert(js.includes('limite: 50'), 'frontend debe trabajar por paginas');
assert(js.includes('/admin/catalogo/productos?'), 'frontend debe consultar backend paginado');
assert(css.includes('.catalog-products-table'), 'falta estilo de tabla profesional');

console.log('OK catalogo-etapa2: administracion, rubros, productos, permisos y paginacion verificados');
