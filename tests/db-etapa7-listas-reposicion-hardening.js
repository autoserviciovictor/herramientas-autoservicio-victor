const fs = require("fs");
function ok(cond, msg) { if (!cond) throw new Error(msg); }
const db = fs.readFileSync("db-listas-reposicion.js", "utf8");
const server = fs.readFileSync("server.js", "utf8");

ok(/importarListasReposicionAtomico[\s\S]*SELECT 1 FROM app_data_migrations[\s\S]*INSERT INTO app_data_migrations/.test(db), "La marca de migración debe comprobarse y grabarse dentro de la transacción");
ok(db.includes("legacy_row INTEGER UNIQUE"), "Listas debe conservar compatibilidad con la fila legacy durante la migración");
ok(db.includes("entry_id TEXT NOT NULL UNIQUE"), "El ID funcional de cada entrada debe ser único");
ok(db.includes("CHECK(quantity > 0)"), "El esquema debe impedir cantidades cero o negativas");
ok(db.includes("CHECK(list_no IN ('1','2'))"), "El esquema debe limitar las listas a 1 y 2");
ok(db.includes("CHECK(state IN ('pendiente','completado'))"), "El esquema debe restringir los estados válidos");
ok(db.includes("jsonb_to_recordset"), "La migración/reemplazo debe usar carga masiva");
ok(server.includes("obtenerListasReposicionLegacy"), "Debe existir una ruta explícita de importación inicial desde Sheets");
ok(server.includes("la hoja Listas queda como respaldo histórico"), "Debe quedar explícito que Sheets solo participa como respaldo tras migrar Etapa 7");
ok(!/async function leerTodasLasListas\([^)]*\)[\s\S]{0,700}sheets\.spreadsheets/.test(server), "La lectura activa de Listas no debe volver a Sheets");
ok(!/async function escribirTodasLasListas\([^)]*\)[\s\S]{0,700}sheets\.spreadsheets/.test(server), "La escritura activa de Listas no debe volver a Sheets");
ok((server.match(/conTransaccionListasReposicion\(async \(cliente\)/g) || []).length >= 6, "Todos los flujos mutables de reposición deben usar transacción PostgreSQL");
ok(server.includes('PostgreSQL Etapa 7: Usuarios, Sectores, Horarios, Tareas, Baño, Inventario, Productos, Vencimientos y Listas/Mi Lista listos.'), "Falta señal de inicialización Etapa 7");

console.log("PostgreSQL Etapa 7 Listas/Mi Lista hardening tests: OK");
