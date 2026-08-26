const fs = require('fs');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const html = fs.readFileSync('index.html','utf8');
const js = fs.readFileSync('admin.js','utf8');
const css = fs.readFileSync('admin-official.css','utf8');

assert(html.includes('id="adminHeaderBackBtn"'), 'Falta el botón Volver del marco superior');
assert((html.match(/data-modulo="admin"\s+data-pro-nav="admin"/g) || []).length >= 2, 'Administración debe quedar marcada en la navegación global desktop y drawer');
assert(css.includes('D22.2 · NAVEGACIÓN DE ADMINISTRACIÓN'), 'Falta la capa de navegación D22.2');
assert(css.includes('body[data-screen="admin"] .pro-desktop-sidebar > .pro-desktop-nav') && css.includes('display:grid !important'), 'El menú global debe mantenerse visible dentro de Administración');
assert(!html.includes('admin-context-navigation') && !css.includes('.admin-context-navigation'), 'La navegación contextual antigua debe estar eliminada, no sólo oculta');
assert(!html.includes('admin-bottom-nav') && !css.includes('.admin-bottom-nav'), 'No debe quedar una segunda navegación interna de Administración');
assert(css.includes('data-admin-view="inicio"') && css.includes('#adminHeaderBackBtn'), 'El botón Volver debe aparecer sólo en vistas internas');
assert(js.includes('$("adminHeaderBackBtn")?.addEventListener("click", () => cambiarTab("inicio"))'), 'Volver debe regresar al Inicio de Administración');
assert(js.includes('.pro-global-nav[data-modulo="admin"]') && js.includes('cambiarTab("inicio")') && js.includes('cargarTodo();'), 'Entrar por Administración debe abrir siempre su Inicio y refrescar sus datos');
console.log('Administración navegación D22.2: OK');
assert(js.includes('async abrirTab(tab = "inicio")') && js.includes('await cargarTodo();'), 'AdminModule debe exponer apertura de vistas sin depender de botones ocultos');
