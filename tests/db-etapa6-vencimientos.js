const fs = require("fs");
const assert = require("assert");

const server = fs.readFileSync("server.js", "utf8");
const db = fs.readFileSync("db-vencimientos.js", "utf8");

assert(db.includes("CREATE TABLE IF NOT EXISTS expiration_records"), "Falta tabla PostgreSQL expiration_records");
assert(db.includes('const BLOQUEO_VENCIMIENTOS = "autoservicio-victor:vencimientos"'), "Falta advisory lock canónico de Vencimientos");
assert(db.includes("pg_advisory_xact_lock(hashtext($1))"), "Vencimientos debe serializar escrituras y migración");
assert(server.includes('MIGRACION_VENCIMIENTOS = "2026-08-28-vencimientos-v1"'), "Falta migración versionada de Etapa 6");
assert(server.includes("importarVencimientosAtomico"), "Falta importación atómica de Vencimientos");
assert(server.includes("listarVencimientosDb()"), "La lectura de Vencimientos no quedó conectada a PostgreSQL");
assert(server.includes("crearVencimientoDb"), "El alta de Vencimientos no usa PostgreSQL");
assert(server.includes("actualizarVencimientoDb"), "La edición/oferta de Vencimientos no usa PostgreSQL");
assert(server.includes("eliminarVencimientoDb"), "La eliminación de Vencimientos no usa PostgreSQL");
assert(server.includes("await asegurarVencimientosPostgres();"), "Etapa 6 no se inicializa en el arranque");

console.log("PostgreSQL Etapa 6 Vencimientos regression tests: OK");
