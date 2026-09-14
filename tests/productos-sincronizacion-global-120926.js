const fs = require('fs');
const assert = require('assert');

const server = fs.readFileSync('server.js', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const admin = fs.readFileSync('admin.js', 'utf8');
const prices = fs.readFileSync('prices.js', 'utf8');
const repo = fs.readFileSync('reposicion.js', 'utf8');

assert(server.includes('sincronizarProductosMaestrosEnTodaLaApp'), 'Falta sincronización global de productos');
assert(server.includes('UPDATE inventory_stock i'), 'Inventario no sincroniza nombres');
assert(server.includes('UPDATE expiration_records e'), 'Vencimientos no sincroniza nombres');
assert(server.includes('UPDATE replenishment_list_entries r'), 'Reposición no sincroniza nombres');
assert(server.includes('invalidarCache("productosMaestros", "productos")'), 'No se invalidan caches de productos');
assert(server.includes('sincronizarRubrosImportadosCatalogoDb(catalogo, cliente)'), 'Catálogo no sincroniza rubros importados');
assert(app.includes('cargarCatalogoMaestroDesdeServidor({ forzar: true })'), 'La app no fuerza refresco del maestro en módulos críticos');
assert(prices.includes('cargarProductos({ forzar: true })'), 'Precios no fuerza refresco al entrar');
assert(repo.includes('cargarProductosMaestroRepo({ forzar: true })'), 'Reposición no fuerza refresco');
assert(admin.includes('Catálogo reemplazado y sincronizado'), 'Falta resumen de sincronización en Admin');

console.log('OK productos-sincronizacion-global-120926');
