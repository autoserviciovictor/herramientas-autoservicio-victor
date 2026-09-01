const fs = require('fs');
const assert = require('assert');

const notifications = fs.readFileSync('notifications.js', 'utf8');

assert.match(notifications, /ESTADO_KEY_BASE = "autoservicio_notificaciones_preferencia_v3"/, 'El estado de activación debe usar la versión V3');
assert.match(notifications, /function claveEstadoNotificaciones\(\)[\s\S]*ESTADO_KEY_BASE[\s\S]*usuarioClave/, 'El estado de notificaciones debe quedar separado por usuario');
assert.match(notifications, /function registrarSuscripcionConReintentos[\s\S]*\[0, 700, 1800\]/, 'El registro Push debe reintentarse ante fallos transitorios');
assert.match(notifications, /Notification\.permission === "granted"[\s\S]*registrarSuscripcionConReintentos/, 'Con permiso concedido debe reparar el registro Push automáticamente');
assert.match(notifications, /Chrome ya tiene permitido mostrar notificaciones, pero no se pudo completar el registro Push/, 'El error no debe indicar una opción Reparar inexistente');
assert.doesNotMatch(notifications, /Entrá a Configuración y tocá Reparar notificaciones/, 'No debe quedar la instrucción obsoleta Reparar notificaciones');

console.log('Permiso de notificaciones ingreso V2 01/09: OK');
