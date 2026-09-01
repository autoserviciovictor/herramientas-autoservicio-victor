const fs = require("fs");
const assert = (v, m) => { if (!v) throw new Error(m); };
const server = fs.readFileSync("server.js", "utf8");
const aux = fs.readFileSync("db-auxiliares.js", "utf8");

const tareasWrites = [
  'app.put("/tareas"',
  'app.post("/tareas/asignacion"',
  'app.post("/tareas/asignaciones-lote"',
  'app.delete("/tareas/asignacion"',
  'app.post("/tareas/completar"',
];
for (const marker of tareasWrites) {
  const start = server.indexOf(marker);
  assert(start >= 0, `Falta endpoint ${marker}`);
  const end = server.indexOf("\n});", start);
  const bloque = server.slice(start, end + 4);
  assert(bloque.includes("conTransaccionTareasBano"), `${marker} no protege lectura-modificación-escritura con la transacción PostgreSQL`);
  assert(
    bloque.includes("obtenerTareasServidor(cliente)") || bloque.includes("listarTareasDb(cliente)"),
    `${marker} no relee tareas dentro del lock`,
  );
  assert(
    ["guardarTareaDb", "eliminarTareasDb", "guardarAsignacionTareaDb", "eliminarAsignacionTareaDb"].some((fn) => bloque.includes(fn)) && bloque.includes("cliente"),
    `${marker} no guarda cambios puntuales usando la misma transacción`,
  );
}

for (const marker of [
  'app.put("/tareas/bano"',
  'app.post("/tareas/bano/confirmar"',
  'app.post("/tareas/bano/verificar"',
]) {
  const start = server.indexOf(marker);
  assert(start >= 0, `Falta endpoint ${marker}`);
  const end = server.indexOf("\n});", start);
  const bloque = server.slice(start, end + 4);
  assert(bloque.includes("conTransaccionTareasBano"), `${marker} no protege la operación de Baño con transacción`);
  assert(bloque.includes("leerBanoServidor(cliente)"), `${marker} no relee Baño dentro del lock`);
  assert(
    (bloque.includes("guardarConfiguracionBanoServidor") || bloque.includes("guardarRegistroBanoServidor")) && bloque.includes("cliente"),
    `${marker} no guarda Baño de forma incremental en la misma transacción`,
  );
}

assert(server.includes("Solo el responsable asignado puede confirmar esta limpieza"), "El backend no valida que confirme el responsable del baño");
assert(server.includes("usuarioCoincideResponsableBano(registro, req.usuario)"), "Falta validación de responsable en confirmación de baño");
assert(server.includes("La limpieza debe ser verificada por otra persona autorizada"), "Falta bloqueo de autoverificación de baño");
assert(server.includes("usuarioCoincideConfirmacionBano(registro, req.usuario)"), "La verificación no compara contra quien confirmó");

assert(aux.includes("notification_log_key_unique_idx"), "Notification log no tiene índice UNIQUE de deduplicación");
assert(aux.includes("DELETE FROM notification_log a USING notification_log b"), "Falta saneo de duplicados anteriores antes del UNIQUE");
assert(/registrarNotificacionEnviadaDb[\s\S]*ON CONFLICT DO NOTHING/.test(aux), "El registro de notificaciones no es idempotente ante concurrencia");

console.log("Auditoría correctiva PostgreSQL Etapas 1-8: OK");
