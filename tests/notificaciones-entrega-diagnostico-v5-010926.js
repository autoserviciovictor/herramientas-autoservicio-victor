const fs = require("fs");
const assert = require("assert");

const server = fs.readFileSync("server.js", "utf8");

assert.match(
  server,
  /function estadoEntregaPush\(resultado\)[\s\S]*?destinatarios[\s\S]*?< 1[\s\S]*?"sin_suscripcion"/,
  "Falta distinguir explícitamente el estado sin_suscripcion",
);

assert.match(
  server,
  /function entregaPushPuedeMarcarEnviada\(resultado\)[\s\S]*?estadoEntregaPush\(resultado\) === "entregado"/,
  "Solo una entrega confirmada debe poder marcarse como enviada",
);

const usosGuardia = server.match(/if \(!entregaPushPuedeMarcarEnviada\(resultado\)\)/g) || [];
assert.ok(
  usosGuardia.length >= 4,
  `Faltan guardias de entrega confirmada en Tareas/Baño/Vencimientos (${usosGuardia.length}/4)`,
);

assert.match(
  server,
  /\[PUSH\] Solicitud de suscripción recibida/,
  "Falta diagnóstico seguro al recibir una suscripción Push",
);
assert.match(
  server,
  /\[PUSH\] Suscripción guardada correctamente/,
  "Falta diagnóstico seguro de suscripción guardada",
);
assert.match(
  server,
  /\[PUSH\] Prueba solicitada/,
  "Falta diagnóstico seguro de la prueba Push",
);
assert.match(
  server,
  /\[PUSH\] Suscripciones activas para prueba:/,
  "Falta diagnóstico del número de suscripciones activas",
);
assert.match(
  server,
  /\[PUSH\] Resultado de prueba/,
  "Falta diagnóstico del resultado de entrega Push",
);

assert.doesNotMatch(
  server,
  /\[PUSH\][^\n]*(endpoint|p256dh|auth_key|VAPID_PRIVATE_KEY)/i,
  "Los logs Push no deben exponer endpoint, claves de suscripción ni la clave VAPID privada",
);

console.log("Entrega real + diagnóstico Push V5 01/09: OK");
