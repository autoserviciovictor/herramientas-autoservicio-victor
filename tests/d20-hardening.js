const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const version = JSON.parse(read('version.json'));
const build = version.assetBuild;
const server = read('server.js');
const auth = read('auth.js');
const tareas = read('tareas.js');
const horarios = read('horarios.js');
const notif = read('notification-center.js');
const sw = read('service-worker.js');
const pwa = read('pwa.js');
const style = read('style.css');
const shell = read('app-shell.css');
const html = read('index.html');

assert(server.includes('"listas-global"'), 'Lista must use one global write queue');
assert(!server.includes('`listas:${usuario}:${numeroLista}`'), 'Per-user list write lock must be removed');
assert(server.includes('sessionVersion'), 'Sessions must have a revocation version');
assert(server.includes('password.length < 8'), 'Backend password minimum must be 8');
assert(server.includes('req.usuario?.permisos?.[m] === true'), 'Permissions must fail closed');
assert(server.includes('"X-Content-Type-Options": "nosniff"'), 'API hardening headers must be enabled');
assert(server.includes('AUTO_MIGRATE_SHEETS'), 'Automatic sheet migration must be configurable');

assert(auth.includes('recibidos[m] === true'), 'Frontend permissions must fail closed');
assert(auth.includes('requiereRevision: true'), 'Offline 4xx operations must be retained for review');
assert(auth.includes('r.status === 401'), 'Offline sync must handle expired sessions explicitly');

assert(tareas.includes('claveUsuarioLocal(base)'), 'Task cache must be user scoped');
assert(tareas.includes('leerJSONUsuario(PENDING_KEY'), 'Task pending changes must be user scoped');
assert(horarios.includes('autoservicio_horarios_cache_v1040:${usuario}'), 'Schedule cache must be user scoped');

assert(notif.includes('escapeHTML as esc'), 'Notification content must be escaped');
assert(notif.includes('urlInternaSegura'), 'Notification destinations must be same-app URLs');
assert(horarios.includes('escAttr(e)'), 'Employee names in schedule attributes must be escaped');
assert(horarios.includes('${esc(e)}'), 'Employee names in schedule HTML must be escaped');

assert(sw.includes(`autoservicio-v${build}`), 'D20 service worker cache version');
for (const resource of [`dialog.js?v=${build}`,`notification-center.js?v=${build}`,`pro-ui.js?v=${build}`]) {
  assert(sw.includes(resource), `App shell missing ${resource}`);
}
assert(sw.includes('brand-logo-desktop-light.png') && sw.includes('brand-logo-desktop-dark.png'), 'Desktop logos must be in app shell');
assert(!pwa.includes('Nueva versión activada automáticamente.'), 'PWA must not auto-activate an update while in use');
assert(pwa.includes('próximo inicio'), 'PWA should defer updates until next start');

assert(html.includes('Content-Security-Policy'), 'Frontend CSP must be present');
assert(html.includes('aria-labelledby="adminSectorModalTitulo"'), 'Admin sector dialog must be labelled');
assert(shell.includes('.mobile-page-title-block { display: none !important; }'), 'Mobile module titles must be hidden from the shared app shell');
assert(html.includes('inventory-page-header mobile-page-title-block'), 'Inventario debe optar por la regla compartida de títulos móviles');
assert(html.includes('venc-pro-header mobile-page-title-block'), 'Vencimientos debe optar por la regla compartida de títulos móviles');
assert(html.includes('repo-pro-header mobile-page-title-block'), 'Mi Lista must not render its page title on mobile');
assert(html.includes('precios-pro-header mobile-page-title-block'), 'Precios must opt into the shared mobile title rule');
assert(html.includes('horarios-page-header mobile-page-title-block'), 'Horarios must opt into the shared mobile title rule');
assert(!style.includes('#pantallaPrecios .precios-pro-header {\n  display: flex !important;'), 'Precios header must not override the shared mobile title visibility');
const horariosCss = read('horarios-redesign.css');
assert(!horariosCss.includes('body.en-horarios #pantallaHorarios .horarios-page-header {\n  width: 100% !important;\n  margin: 0 0 14px !important;\n  padding: 0 !important;\n  display: flex !important;'), 'Horarios header must not override the shared mobile title visibility');

console.log('D20 hardening tests: OK');

const sharedDom = read('shared/dom-utils.js');
assert(sharedDom.includes('&quot;') && sharedDom.includes('&#39;'), 'shared HTML escaping must also protect quoted attribute contexts');
