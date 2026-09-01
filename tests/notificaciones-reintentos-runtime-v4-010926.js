const fs = require('fs');
const assert = require('assert');

const notifications = fs.readFileSync('notifications.js', 'utf8');
const sw = fs.readFileSync('service-worker.js', 'utf8');

const inicio = notifications.indexOf('async function registrarSuscripcionConReintentos');
const fin = notifications.indexOf('\nasync function solicitarPermisoNativoAlIngresar', inicio);
assert.ok(inicio >= 0 && fin > inicio, 'No se encontró registrarSuscripcionConReintentos');
const bloque = notifications.slice(inicio, fin);

assert.match(
  bloque,
  /const ok = await registrarSuscripcion\(\{ probar \}\);/,
  'Los reintentos deben invocar registrarSuscripcion real',
);
assert.ok(
  !/await registrarSuscripcionConReintentos\(\{ probar \}\)/.test(bloque),
  'registrarSuscripcionConReintentos no puede llamarse a sí misma',
);
assert.match(bloque, /const esperas = \[0, 700, 1800\]/, 'Debe conservar la política de tres intentos');
assert.ok(
  sw.includes('NOTIFICACIONES_REINTENTOS_RUNTIME_V4_010926'),
  'El service worker debe cambiar para refrescar notifications.js en dispositivos instalados',
);

console.log('Reintentos runtime Push V4 01/09: OK');
