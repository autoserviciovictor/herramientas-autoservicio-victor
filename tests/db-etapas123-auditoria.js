const fs = require("fs");

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

const db = fs.readFileSync("db.js", "utf8");
const usuarios = fs.readFileSync("db-usuarios-sectores.js", "utf8");
const horarios = fs.readFileSync("db-horarios.js", "utf8");
const server = fs.readFileSync("server.js", "utf8");
const gitignore = fs.readFileSync(".gitignore", "utf8");

// Etapa 1: infraestructura y secretos.
ok(gitignore.split(/\r?\n/).includes(".env"), "Etapa 1: .env debe permanecer fuera de Git");
ok(db.includes('const DATABASE_URL = String(process.env.DATABASE_URL || "").trim()'), "Etapa 1: falta DATABASE_URL");
ok(db.includes("connectionTimeoutMillis") && db.includes("idleTimeoutMillis"), "Etapa 1: faltan límites del pool");
ok(db.includes('pool.on("error"'), "Etapa 1: falta manejo de error del pool");
ok(server.indexOf('require("dotenv").config()') < server.indexOf('require("./db")'), "Etapa 1: dotenv debe cargarse antes de db.js");
ok(server.includes('process.once("SIGTERM"') && server.includes("cerrarPostgres"), "Etapa 1: falta cierre ordenado de PostgreSQL");

// Etapa 2: importación única y consistencia Usuarios/Sectores.
ok(usuarios.includes("BLOQUEO_USUARIOS_SECTORES"), "Etapa 2: falta advisory lock");
ok(usuarios.includes("pg_advisory_xact_lock(hashtext($1))"), "Etapa 2: la migración debe serializarse en PostgreSQL");
ok(/importarUsuariosSectoresAtomico[\s\S]*migracionDatosCompletada\(claveMigracion, cliente\)/.test(usuarios), "Etapa 2: la marca de migración debe comprobarse dentro de la transacción");
ok(usuarios.includes("users_managed_sectors_gin_idx"), "Etapa 2: falta índice para sectores administrados");
ok(usuarios.includes("eliminarUsuarioConSupervisionDb"), "Etapa 2: la eliminación de usuario debe limpiar supervisiones atómicamente");
ok(usuarios.includes("sector_id=$1 OR $1 = ANY(managed_sectors)"), "Etapa 2: eliminar sector debe validar sector principal y sectores a cargo");
ok(server.includes('(u) => u.sector === id || (u.sectores || []).includes(id)'), "Etapa 2: endpoint debe impedir borrar sectores todavía referenciados");

// Integridad cruzada Etapa 2 + Etapa 3.
for (const tabla of [
  "schedule_calendar",
  "schedule_details",
  "schedule_replacements",
  "schedule_personnel_order",
  "schedule_shifts",
]) {
  ok(usuarios.includes(`DELETE FROM ${tabla} WHERE sector_id=$1`), `Integridad 2/3: falta limpiar ${tabla} al eliminar un sector`);
}
ok(usuarios.includes("{ bloquearHorarios: true }"), "Integridad 2/3: el borrado de sector debe bloquear Horarios en la misma transacción");
ok(horarios.includes('const BLOQUEO_HORARIOS = "autoservicio-victor:horarios"'), "Etapa 3: falta lock canónico de Horarios");

console.log("Auditoría PostgreSQL Etapas 1-3: OK");
