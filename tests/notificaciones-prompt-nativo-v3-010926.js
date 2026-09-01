const fs = require('fs');
const assert = require('assert');
const notifications = fs.readFileSync('notifications.js', 'utf8');

assert.match(notifications, /async function solicitarPermisoNativoAlIngresar\(\)/, 'Falta el flujo V3 de permiso nativo');
assert.match(notifications, /if \(Notification\.permission !== "default"\) return;/, 'Solo debe invocarse el prompt cuando Chrome todavía puede preguntarlo');
assert.match(notifications, /Notification\.requestPermission\(\)/, 'Debe invocarse el prompt nativo de Chrome');
assert.match(notifications, /\$\("btnLoginIngresar"\)\?\.addEventListener\("click", solicitarPermisoNativoAlIngresar\)/, 'El prompt debe dispararse desde un gesto explícito de usuario');
assert.match(notifications, /permiso !== "granted"[\s\S]*return false/, 'No debe registrar Push si el permiso no fue concedido');
assert.match(notifications, /registrarSuscripcionConReintentos\(\{ probar: true \}\)/, 'Tras conceder permiso debe registrar y verificar Push');
assert.doesNotMatch(notifications, /titulo: "Activar notificaciones"/, 'No debe mostrarse un modal previo propio');
console.log('Prompt nativo Chrome notificaciones V3 01/09: OK');
