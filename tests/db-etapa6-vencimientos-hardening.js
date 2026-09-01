const fs = require("fs");
function ok(cond, msg) { if (!cond) throw new Error(msg); }
const db = fs.readFileSync("db-vencimientos.js", "utf8");
const server = fs.readFileSync("server.js", "utf8");

ok(/importarVencimientosAtomico[\s\S]*SELECT 1 FROM app_data_migrations[\s\S]*INSERT INTO app_data_migrations/.test(db), "La marca de migración debe comprobarse y grabarse dentro de la transacción");
ok(db.includes("legacy_row INTEGER UNIQUE"), "Vencimientos debe conservar la fila legacy para compatibilidad");
ok(db.includes("record_id TEXT NOT NULL UNIQUE"), "El ID funcional de vencimiento debe ser único");
ok(db.includes("CHECK(quantity >= 0)"), "El esquema debe impedir cantidades negativas");
ok(db.includes("FOR UPDATE"), "Las mutaciones deben bloquear el registro antes de actualizar/eliminar");
ok(db.includes("jsonb_to_recordset"), "La migración inicial debe ser masiva y no consulta por registro");
ok(!server.includes("obtenerVencimientosLegacy"), "No debe quedar lectura legacy de Vencimientos");
ok(!server.includes('const VENCIMIENTOS_SHEET_NAME ='), "Vencimientos no debe conservar una hoja legacy");
ok(!/async function obtenerVencimientos\(\)[\s\S]{0,500}sheets\.spreadsheets/.test(server), "La lectura activa de Vencimientos no debe volver a Sheets");
ok(!/app\.post\("\/vencimientos"[\s\S]{0,2500}sheets\.spreadsheets\.values\.append/.test(server), "El alta activa de Vencimientos no debe escribir en Sheets");
ok(!/app\.put\("\/vencimientos\/:id"[\s\S]{0,3200}sheets\.spreadsheets\.values\.update/.test(server), "La edición activa de Vencimientos no debe escribir en Sheets");
ok(!/app\.patch\("\/vencimientos\/:id\/oferta"[\s\S]{0,2200}sheets\.spreadsheets\.values\.update/.test(server), "La oferta activa de Vencimientos no debe escribir en Sheets");
ok(!/app\.delete\("\/vencimientos\/:id"[\s\S]{0,2200}deleteDimension/.test(server), "La eliminación activa de Vencimientos no debe borrar filas de Sheets");
ok(server.includes('MIGRACION_VENCIMIENTOS = "2026-08-28-vencimientos-v1"'), "Falta validación de migración Vencimientos");

console.log("PostgreSQL Etapa 6 Vencimientos hardening tests: OK");
