const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const front = read('notifications.js');
const ui = read('pro-ui.js');
const server = read('server.js');

assert(front.includes('autoservicio_notificaciones_vapid_public_key_v1'), 'Debe recordar la clave VAPID usada por el dispositivo');
assert(front.includes('subscription.unsubscribe()'), 'Debe renovar suscripciones ligadas a una VAPID anterior');
assert(front.includes('/notificaciones/prueba'), 'La activación manual debe verificar el circuito push');
assert(front.includes('data.pushState') || front.includes('dataset.pushState'), 'El botón debe reflejar el estado real del push');
assert(front.includes('Reparar notificaciones'), 'Debe permitir reparar una suscripción fallida aun con permiso concedido');
assert(ui.includes('permission === "granted" && pushState === "active"'), 'La UI no debe considerar activado solo por permiso del navegador');
assert(server.includes('PUSH_ESTADOS_REINTENTABLES'), 'El backend debe reintentar errores temporales del proveedor push');
assert(server.includes('[429, 500, 502, 503, 504]'), 'Deben contemplarse los errores temporales habituales');
assert(server.includes('app.post("/notificaciones/prueba"'), 'Debe existir endpoint de prueba push autenticado');
assert((server.match(/webpush\.sendNotification/g) || []).length === 1, 'Debe existir un único mecanismo canónico de envío web-push');
assert(server.includes('return enviarPushASuscripciones(suscripciones, payload);'), 'Vencimientos debe reutilizar el mecanismo canónico');

console.log('Corrección notificaciones push 01/09: OK');
