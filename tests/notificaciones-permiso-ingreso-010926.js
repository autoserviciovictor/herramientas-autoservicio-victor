const fs = require('fs');
const assert = require('assert');

const notifications = fs.readFileSync('notifications.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('service-worker.js', 'utf8');

assert.match(notifications, /async function mostrarAvisoPermisoNotificaciones\(\)/, 'Falta el flujo de aviso al ingresar');
assert.match(notifications, /Notification\.permission === "granted"[\s\S]*registrarSuscripcion/, 'Con permiso concedido debe revalidar la suscripción sin volver a pedir permiso');
assert.match(notifications, /Notification\.permission === "denied"[\s\S]*Notificaciones bloqueadas/, 'El permiso bloqueado debe informarse sin insistir con el prompt nativo');
assert.match(notifications, /dialogo\.confirm\(\{[\s\S]*titulo: "Activar notificaciones"[\s\S]*confirmarTexto: "Activar notificaciones"/, 'Debe mostrar un cartel propio con acción explícita');
assert.match(notifications, /const ok = await activarNotificaciones\(\)/, 'El permiso nativo debe solicitarse después de la acción del usuario');
assert.match(notifications, /window\.addEventListener\("autoservicio:sesion"[\s\S]*programarAvisoPermisoNotificaciones/, 'El chequeo debe programarse al iniciar sesión');
assert.match(notifications, /if \(!usuarioEvento\)[\s\S]*avisoPermisoUsuario = ""/, 'Cerrar sesión debe permitir evaluar correctamente al siguiente usuario');
assert.ok(!/window\.addEventListener\("autoservicio:sesion", \(\) => \{[\s\S]*registrarSuscripcion\(\{ probar: false \}\)/.test(notifications), 'No debe quedar el flujo viejo de suscripción silenciosa como único control de ingreso');

const asset = './notifications.js?v=1960-d21-cierre-etapa6-010926';
assert.ok(index.includes(asset), 'index.html debe conservar el build D21 canónico de notifications.js');
assert.ok(sw.includes(asset), 'service-worker.js debe precachear el mismo build D21 de notifications.js');
assert.ok(sw.includes('NOTIFICACIONES_PERMISO_V2_010926'), 'El service worker debe forzar el refresco V2 de notifications.js');

console.log('Permiso de notificaciones al ingreso 01/09: OK');
