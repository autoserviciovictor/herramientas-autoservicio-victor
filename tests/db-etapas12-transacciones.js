const path = require("path");

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

const dbPath = require.resolve("../db");
const modPath = require.resolve("../db-usuarios-sectores");
const calls = [];
let migrationExists = false;
let sectorInUse = false;

const client = {
  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    calls.push({ sql: normalized, params });
    if (normalized.startsWith("SELECT 1 FROM app_data_migrations")) {
      return { rowCount: migrationExists ? 1 : 0, rows: migrationExists ? [{}] : [] };
    }
    if (normalized.startsWith("INSERT INTO app_data_migrations")) {
      migrationExists = true;
      return { rowCount: 1, rows: [] };
    }
    if (normalized.startsWith("SELECT username FROM users")) {
      return { rowCount: sectorInUse ? 1 : 0, rows: sectorInUse ? [{ username: "u" }] : [] };
    }
    return { rowCount: 1, rows: [] };
  },
  release() { calls.push({ sql: "RELEASE", params: [] }); },
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    query: async (sql, params) => client.query(sql, params),
    obtenerPool: () => ({ connect: async () => client }),
  },
};
delete require.cache[modPath];
const dbus = require("../db-usuarios-sectores");

(async () => {
  calls.length = 0;
  migrationExists = false;
  const imported = await dbus.importarUsuariosSectoresAtomico(
    [{ id: "deposito", nombre: "Depósito", color: "#f59e0b", supervisor: "", activo: true }],
    [{ usuario: "u", nombre: "U", passwordHash: "h", rol: "personal", activo: true, permisos: {}, sector: "deposito", sectores: [], sessionVersion: 1, googleEmail: "" }],
    "m1",
  );
  ok(imported === true, "La primera importación debe ejecutarse");
  ok(calls.some((c) => c.sql === "BEGIN"), "La importación debe abrir transacción");
  ok(calls.some((c) => c.sql.includes("pg_advisory_xact_lock")), "La importación debe tomar advisory lock");
  ok(calls.some((c) => c.sql === "COMMIT"), "La importación debe confirmar transacción");

  calls.length = 0;
  const importedAgain = await dbus.importarUsuariosSectoresAtomico([], [], "m1");
  ok(importedAgain === false, "La migración marcada no debe repetirse");
  ok(!calls.some((c) => c.sql.startsWith("INSERT INTO sectors")), "No debe reimportar sectores");

  calls.length = 0;
  sectorInUse = false;
  await dbus.eliminarSectorConHorariosDb("deposito");
  const deleteOrder = calls.filter((c) => c.sql.startsWith("DELETE FROM")).map((c) => c.sql);
  for (const table of ["schedule_calendar", "schedule_details", "schedule_replacements", "schedule_personnel_order", "schedule_shifts", "sectors"]) {
    ok(deleteOrder.some((sql) => sql.includes(`DELETE FROM ${table}`)), `Debe limpiar ${table}`);
  }
  ok(calls.filter((c) => c.sql.includes("pg_advisory_xact_lock")).length === 2, "Borrar sector debe bloquear Usuarios/Sectores y Horarios");

  calls.length = 0;
  sectorInUse = true;
  let rejected = false;
  try { await dbus.eliminarSectorConHorariosDb("deposito"); } catch (e) {
    rejected = e.code === "SECTOR_EN_USO";
  }
  ok(rejected, "Debe rechazar un sector todavía referenciado");
  ok(calls.some((c) => c.sql === "ROLLBACK"), "El rechazo debe hacer rollback");
  ok(!calls.some((c) => c.sql.startsWith("DELETE FROM schedule_calendar")), "No debe borrar horarios si el sector está en uso");

  console.log("Transacciones PostgreSQL Etapas 1-2: OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
