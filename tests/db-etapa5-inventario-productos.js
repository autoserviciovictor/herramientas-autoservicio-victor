const fs = require("fs");
const assert = require("assert");

const server = fs.readFileSync("server.js", "utf8");
const db = fs.readFileSync("db-inventario-productos.js", "utf8");

for (const tabla of ["inventory_stock", "product_catalog"]) {
  assert(db.includes(`CREATE TABLE IF NOT EXISTS ${tabla}`), `Falta tabla PostgreSQL ${tabla}`);
}
assert(db.includes('const BLOQUEO_INVENTARIO_PRODUCTOS = "autoservicio-victor:inventario-productos"'), "Falta advisory lock canónico de Inventario/Productos");
assert(db.includes("pg_advisory_xact_lock(hashtext($1))"), "Inventario/Productos debe serializar escrituras y migración");
assert(server.includes('MIGRACION_INVENTARIO_PRODUCTOS = "2026-08-28-inventario-productos-v1"'), "Falta migración versionada de Etapa 5");
assert(!server.includes("importarInventarioProductosAtomico"), "El runtime no debe conservar la importación legacy de Inventario/Productos");
assert(server.includes("listarInventarioDb()"), "Inventario no quedó conectado a PostgreSQL");
assert(server.includes("buscarInventarioPorCodigoDb"), "La consulta individual de Inventario no usa PostgreSQL");
assert(server.includes("listarCatalogoDb()"), "Productos no quedó conectado a PostgreSQL");
assert(server.includes("buscarCatalogoPorCodigoDb"), "La consulta individual de Productos no usa PostgreSQL");
assert(server.includes("sumarInventarioDb"), "La carga de inventario no usa escritura PostgreSQL");
assert(server.includes("corregirInventarioDb"), "La corrección de inventario no usa escritura PostgreSQL");
assert(server.includes("reemplazarCatalogoDb"), "La importación administrativa del catálogo no escribe PostgreSQL");
assert(server.includes("await asegurarInventarioProductosPostgres();"), "Etapa 5 no se inicializa en el arranque");

console.log("PostgreSQL Etapa 5 Inventario/Productos regression tests: OK");
