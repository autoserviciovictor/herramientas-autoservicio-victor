const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const notifications = fs.readFileSync(path.join(root, "notifications.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(
  notifications.includes("if (subscription && !forzarRenovacion) return subscription;"),
  "Debe reutilizar una suscripción existente antes de renovarla",
);
assert(
  !notifications.includes("const requiereRenovar = Boolean("),
  "No debe quedar la renovación destructiva basada sólo en localStorage/VAPID",
);
assert(
  notifications.includes("forzarRenovacion: true"),
  "Debe existir una autorreparación explícita posterior a una prueba fallida",
);
assert(
  notifications.includes('reportarDiagnosticoPushCliente("subscribe-error", error)'),
  "Debe registrar errores reales de PushManager.subscribe",
);
assert(
  notifications.includes('reportarDiagnosticoPushCliente("registro-error", error)'),
  "Debe registrar el error final del registro Push",
);
assert(
  !notifications.includes('titulo: "Revisar notificaciones"'),
  "No debe mostrarse el aviso genérico Revisar notificaciones",
);
assert(
  server.includes('app.post("/notificaciones/diagnostico-cliente", requerirSesion'),
  "Debe existir el endpoint autenticado de diagnóstico del navegador",
);
assert(
  server.includes('console.info("[PUSH][CLIENTE]"'),
  "Render debe registrar las fases seguras del navegador",
);
assert(
  !server.includes('console.info("[PUSH][CLIENTE]", { endpoint'),
  "El diagnóstico no debe registrar endpoints Push",
);

console.log("Registro Push conservador + diagnóstico V8 01/09: OK");
