const fs = require("fs");
const assert = require("assert");

const server = fs.readFileSync("server.js", "utf8");
const sw = fs.readFileSync("service-worker.js", "utf8");

assert(server.includes('app.post("/notificaciones/confirmacion-sw"'), "Falta endpoint de confirmación SW");
assert(server.includes("crearTokenConfirmacionPush"), "Falta token firmado de confirmación Push");
assert(server.includes("verificarTokenConfirmacionPush"), "Falta validación del token de confirmación Push");
assert(server.includes('console.info("[PUSH][SW]"'), "Falta diagnóstico seguro de recepción/visualización");
assert(server.includes("payloadConConfirmacionPush(payload)"), "El envío Push no adjunta confirmación para el SW");
assert(server.includes("JSON.stringify(payloadEntrega)"), "web-push no está enviando el payload instrumentado");
assert(!server.includes("p256dh: req.body"), "El diagnóstico no debe registrar claves de suscripción");

assert(sw.includes("NOTIFICACIONES_VISUALIZACION_SW_V7_010926"), "Falta marcador V7 del service worker");
assert(sw.includes('reportar("push-recibido")'), "El SW no confirma la recepción real del Push");
assert(sw.includes('reportar("notificacion-mostrada")'), "El SW no confirma showNotification exitoso");
assert(sw.includes('reportar("showNotification-error", error)'), "El SW no reporta el error de showNotification");
assert(sw.includes('reportar("notificacion-mostrada-fallback")'), "Falta fallback mínimo de notificación");
assert(sw.includes('reportar("showNotification-fallback-error", fallbackError)'), "Falta diagnóstico del fallback");
assert(!sw.includes("vibrate:"), "La V7 debe evitar opciones no esenciales durante el diagnóstico de Android");
assert(!sw.includes("renotify:"), "La V7 debe evitar opciones no esenciales durante el diagnóstico de Android");

console.log("Visualización real Push + confirmación SW V7 01/09: OK");
