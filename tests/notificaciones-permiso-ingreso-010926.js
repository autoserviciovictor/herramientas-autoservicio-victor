const fs = require('fs');
const assert = require('assert');

const notifications = fs.readFileSync('notifications.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('service-worker.js', 'utf8');

assert.match(notifications, /async function mostrarAvisoPermisoNotificaciones\(\)/, 'Falta el control de notificaciones al ingresar');
assert.match(notifications, /Notification\.permission === "granted"[\s\S]*registrarSuscripcionConReintentos/, 'Con permiso concedido debe revalidar la suscripción sin volver a pedir permiso');
assert.match(notifications, /Notification\.permission === "denied"[\s\S]*Notificaciones bloqueadas/, 'El permiso bloqueado debe informarse sin insistir con el prompt nativo');
assert.match(notifications, /async function solicitarPermisoNativoAlIngresar\(\)[\s\S]*Notification\.requestPermission\(\)/, 'Debe existir solicitud nativa directa de permiso');
assert.match(notifications, /btnLoginIngresar[\s\S]*solicitarPermisoNativoAlIngresar/, 'La solicitud nativa debe estar ligada al click real de Ingresar');
assert.doesNotMatch(notifications, /titulo: "Activar notificaciones"[\s\S]*confirmarTexto: "Activar notificaciones"/, 'No debe quedar un cartel intermedio propio antes del prompt de Chrome');
assert.match(notifications, /window\.addEventListener\("autoservicio:sesion"[\s\S]*programarAvisoPermisoNotificaciones/, 'El chequeo debe programarse al iniciar sesión');

const asset = './notifications.js?v=1960-d21-cierre-etapa6-010926';
assert.ok(index.includes(asset), 'index.html debe conservar el build D21 canónico de notifications.js');
assert.ok(sw.includes(asset), 'service-worker.js debe precachear el mismo build D21 de notifications.js');
assert.ok(sw.includes('NOTIFICACIONES_PROMPT_NATIVO_V3_010926'), 'El service worker debe forzar el refresco V3 de notifications.js');

console.log('Permiso de notificaciones al ingreso 01/09: OK');
