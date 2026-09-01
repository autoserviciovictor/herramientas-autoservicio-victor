const fs = require('fs');
const assert = require('assert');

const notifications = fs.readFileSync('notifications.js', 'utf8');

assert.match(notifications, /ESTADO_KEY_BASE = "autoservicio_notificaciones_preferencia_v3"/, 'El estado de activación debe usar la versión V3');
assert.match(notifications, /function claveEstadoNotificaciones\(\)[\s\S]*ESTADO_KEY_BASE[\s\S]*usuarioClave/, 'El estado de notificaciones debe quedar separado por usuario');
assert.doesNotMatch(notifications, /localStorage\.getItem\(ESTADO_KEY\)|localStorage\.setItem\(ESTADO_KEY|localStorage\.removeItem\(ESTADO_KEY/, 'No debe quedar la clave global antigua de estado');
assert.match(notifications, /if \(!dialogo\?\.confirm\) \{[\s\S]*return;[\s\S]*\}/, 'Si el diálogo todavía no existe, debe permitir reintentar sin marcar al usuario como avisado');
assert.match(notifications, /function programarAvisoPermisoNotificaciones\(\)[\s\S]*\[0, 250, 1000\]/, 'El aviso debe reintentarse brevemente para cubrir carreras de inicialización');
assert.match(notifications, /Notification\.permission === "denied"[\s\S]*dialogo\.alert\(\{[\s\S]*Notificaciones bloqueadas/, 'Un permiso bloqueado debe mostrar un cartel visible al usuario');
assert.match(notifications, /Notification\.permission === "granted"[\s\S]*const probar = localStorage\.getItem\(claveEstadoNotificaciones\(\)\) !== "activadas"[\s\S]*registrarSuscripcion\(\{ probar \}\)/, 'Con permiso concedido debe registrar y verificar una vez por usuario/dispositivo');
assert.match(notifications, /if \(ok\) \{[\s\S]*avisoPermisoUsuario = usuarioClave/, 'Solo una activación correcta debe marcar al usuario como resuelto');


console.log('Permiso de notificaciones ingreso V2 01/09: OK');
