const fs = require("fs");
function ok(cond, msg) { if (!cond) throw new Error(msg); }
const db = fs.readFileSync("db-inventario-productos.js", "utf8");
const server = fs.readFileSync("server.js", "utf8");

ok(/importarInventarioProductosAtomico[\s\S]*SELECT 1 FROM app_data_migrations[\s\S]*INSERT INTO app_data_migrations/.test(db), "La marca de migración debe comprobarse y grabarse dentro de la transacción");
ok(db.includes("legacy_row INTEGER UNIQUE"), "Inventario y catálogo deben conservar un orden/fila legacy compatible");
ok(db.includes("inventory_id BIGSERIAL PRIMARY KEY"), "Inventario debe permitir preservar filas históricas aun si existen códigos repetidos");
ok(db.includes("catalog_id BIGSERIAL PRIMARY KEY"), "Catálogo debe poder importar fielmente filas históricas antes de futuros reemplazos");
ok(db.includes("jsonb_to_recordset"), "La importación masiva no debe hacer una consulta PostgreSQL por cada producto");
ok(db.includes("CHECK(stock_total >= 0)") && db.includes("CHECK(salon >= 0)") && db.includes("CHECK(deposito >= 0)"), "El esquema debe impedir stock negativo");
ok(db.includes("FOR UPDATE"), "La actualización debe bloquear la fila de inventario durante la transacción");
ok(server.includes("obtenerProductosLegacy") && server.includes("obtenerProductosMaestrosLegacy"), "Debe existir una ruta explícita de importación inicial desde Sheets");
ok(server.includes("Stock y Productos quedan como respaldo histórico"), "Debe quedar explícito que Sheets solo participa en la importación inicial de Etapa 5");
ok(server.includes("reemplazarCatalogoDb(catalogo)"), "La importación administrativa debe reemplazar el catálogo PostgreSQL");
ok(!/async function obtenerProductos\(\)[\s\S]{0,450}sheets\.spreadsheets/.test(server), "La lectura activa de Inventario no debe volver a Sheets");
ok(!/async function obtenerProductosMaestros\(\)[\s\S]{0,450}sheets\.spreadsheets/.test(server), "La lectura activa del catálogo no debe volver a Sheets");
ok(server.includes('PostgreSQL Etapa 5: Usuarios, Sectores, Horarios, Tareas, Baño, Inventario y Productos listos.'), "Falta señal de inicialización Etapa 5");

console.log("PostgreSQL Etapa 5 Inventario/Productos hardening tests: OK");
