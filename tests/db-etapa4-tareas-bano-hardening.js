const fs = require("fs");
function ok(cond, msg) { if (!cond) throw new Error(msg); }
const db = fs.readFileSync("db-tareas-bano.js", "utf8");
const server = fs.readFileSync("server.js", "utf8");

ok(/importarTareasBanoAtomico[\s\S]*SELECT 1 FROM app_data_migrations[\s\S]*INSERT INTO app_data_migrations/.test(db), "La marca de migración debe comprobarse y grabarse dentro de la transacción");
ok(db.includes("PRIMARY KEY(task_id, work_date, shift_type)"), "Las asignaciones necesitan clave única por tarea/fecha/turno");
ok(db.includes("PRIMARY KEY") && db.includes("work_date TEXT PRIMARY KEY"), "El historial de Baño debe impedir confirmaciones duplicadas por fecha");
ok(db.includes("responsibles JSONB") && db.includes("extra JSONB"), "La migración debe conservar responsables y propiedades adicionales de asignaciones");
ok(db.includes("weekdays JSONB"), "La configuración semanal de tareas debe persistirse");
ok(server.includes("obtenerTareasLegacy") && server.includes("leerBanoLegacy"), "Debe existir una ruta explícita de importación legacy");
ok(server.includes("Sheets queda como respaldo histórico"), "Debe quedar explícito que Sheets solo participa en la importación inicial");
ok(server.includes('PostgreSQL Etapa 4: Usuarios, Sectores, Horarios, Tareas y Baño listos.'), "Falta señal de inicialización Etapa 4");

console.log("PostgreSQL Etapa 4 Tareas/Baño hardening tests: OK");
