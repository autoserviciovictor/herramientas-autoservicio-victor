const fs = require("fs");
const assert = require("assert");

const server = fs.readFileSync("server.js", "utf8");
const db = fs.readFileSync("db-tareas-bano.js", "utf8");

for (const tabla of ["tasks", "task_assignments", "bathroom_rotation_config", "bathroom_rotation_history"]) {
  assert(db.includes(`CREATE TABLE IF NOT EXISTS ${tabla}`), `Falta tabla PostgreSQL ${tabla}`);
}
assert(db.includes('const BLOQUEO_TAREAS_BANO = "autoservicio-victor:tareas-bano"'), "Falta advisory lock canónico de Tareas/Baño");
assert(db.includes("pg_advisory_xact_lock(hashtext($1))"), "Tareas/Baño debe serializar escrituras y migración");
assert(db.includes("ON DELETE CASCADE"), "Las asignaciones deben eliminarse con su tarea");
assert(server.includes('MIGRACION_TAREAS_BANO = "2026-08-28-tareas-bano-v1"'), "Falta migración versionada de Etapa 4");
assert(server.includes("importarTareasBanoAtomico"), "Falta importación atómica Tareas/Baño");
assert(server.includes("listarTareasDb(cliente)"), "Tareas no quedó conectado a PostgreSQL");
assert(server.includes("leerBanoDb(cliente)"), "Baño no quedó conectado a PostgreSQL");
assert(server.includes("reemplazarTareasDb"), "Falta escritura PostgreSQL de Tareas");
assert(server.includes("guardarBanoDb"), "Falta escritura PostgreSQL de Baño");
assert(server.includes("await asegurarTareasBanoPostgres();"), "Etapa 4 no se inicializa en el arranque");

const runtimeInicio = server.indexOf('app.get("/tareas/contexto"');
const runtimeFin = server.indexOf('app.get("/tareas/usuarios"', runtimeInicio);
const runtime = server.slice(runtimeInicio, runtimeFin);
assert(runtimeInicio > 0 && runtimeFin > runtimeInicio, "No se pudo delimitar runtime de Tareas");
assert(!runtime.includes("sheets.spreadsheets.values."), "Los endpoints activos de Tareas/Baño todavía acceden a Sheets");

console.log("PostgreSQL Etapa 4 Tareas/Baño regression tests: OK");
