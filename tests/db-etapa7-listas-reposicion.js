const fs = require("fs");
const assert = require("assert");

const server = fs.readFileSync("server.js", "utf8");
const db = fs.readFileSync("db-listas-reposicion.js", "utf8");

assert(db.includes("CREATE TABLE IF NOT EXISTS replenishment_list_entries"), "Falta tabla PostgreSQL de Listas/Mi Lista");
assert(db.includes('const BLOQUEO_LISTAS_REPOSICION = "autoservicio-victor:listas-reposicion"'), "Falta advisory lock canónico de Listas");
assert(db.includes("pg_advisory_xact_lock(hashtext($1))"), "Listas debe serializar escrituras y migración");
assert(server.includes('MIGRACION_LISTAS_REPOSICION = "2026-08-28-listas-reposicion-v1"'), "Falta migración versionada de Etapa 7");
assert(!server.includes("importarListasReposicionAtomico"), "El runtime no debe conservar importación legacy de Listas/Mi Lista");
assert(server.includes("listarListasReposicionDb(cliente)"), "La lectura activa de listas no quedó conectada a PostgreSQL");
assert(server.includes("reemplazarListasReposicionDb(registros, cliente)"), "La escritura activa de listas no quedó conectada a PostgreSQL");
assert(server.includes("conTransaccionListasReposicion(async (cliente)"), "Las mutaciones de listas deben cubrir lectura y escritura con una transacción PostgreSQL");
assert(server.includes("await asegurarListasReposicionPostgres();"), "Etapa 7 no se inicializa en el arranque");

console.log("PostgreSQL Etapa 7 Listas/Mi Lista regression tests: OK");
