const fs = require('fs');
const assert = require('assert');
const css = fs.readFileSync('admin-official.css','utf8');
const html = fs.readFileSync('index.html','utf8');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const version = JSON.parse(fs.readFileSync('version.json','utf8'));
const build = version.assetBuild;

assert(html.includes(`admin-official.css?v=${build}`), 'admin css build no actualizado');
assert(html.includes(build), 'index no contiene build final');
assert(pkg.description.includes('Auditoría') && version.build === 'D21', 'metadata D21 de auditoría ausente');

// La condición móvil vieja de Administración fue eliminada, no sobreescrita.
assert(!css.includes('#pantallaAdmin.admin-official-screen{width:100%!important;padding:14px 12px 96px!important;'), 'sigue presente el bloque móvil viejo de admin');
assert(css.includes('padding:12px 12px calc(96px + env(safe-area-inset-bottom)) !important;'), 'marco móvil canónico ausente');
assert(css.includes('#pantallaAdmin > .admin-tab-panel{'), 'paneles admin no tienen ancho móvil unificado');

// Los títulos de módulo no consumen altura en celular.
for (const id of ['#adminTab-inicio > .admin-page-heading','#adminTab-usuarios > .admin-page-heading','#adminTab-sistema > .admin-page-heading']) {
  assert(css.includes(id), `falta regla móvil para ${id}`);
}

// Administración conserva controles legibles y modales consistentes.
assert(css.includes('#adminUsuarioModal .admin-user-modal-v2'), 'modal usuario sin regla móvil compartida');
assert(css.includes('font-size:13px !important;'), 'inputs/selects administrativos siguen en escala mini');
assert(css.includes('padding-bottom:64px !important;'), 'listados admin sin reserva frente al FAB');

// Selectores canónicos siguen activos en administración; no se vuelve a select nativo visual.
const adminJs = fs.readFileSync('admin.js','utf8');
assert(adminJs.includes('admin-rubro-app-select'), 'selectores custom de administración ausentes');
assert(css.includes('.admin-rubro-select-menu'), 'menú custom de administración sin estilos');

console.log('OK auditoria final etapa 7');
