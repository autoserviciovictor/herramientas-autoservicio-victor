const fs = require('fs');
const assert = (x,m)=>{if(!x) throw new Error(m)};
const server=fs.readFileSync('server.js','utf8');
const db=fs.readFileSync('db-auxiliares.js','utf8');
const notif=fs.readFileSync('notifications.js','utf8');
const html=fs.readFileSync('index.html','utf8');
for (const id of ['settingsNotifVencAlmacen','settingsNotifVencBebidas','settingsNotifVencFiambreria','settingsNotifVencLacteos']) assert(html.includes(id),`Falta ${id}`);
for (const key of ['vencimientosAlmacen','vencimientosBebidas','vencimientosFiambreria','vencimientosLacteos']) { assert(server.includes(key),`Servidor no maneja ${key}`); assert(notif.includes(key),`Cliente no maneja ${key}`); }
assert(server.includes('rubroVencimientosActivo(contexto, usuario.usuario, rubro)'), 'Vencimientos no filtra destinatarios por rubro');
assert(server.includes('rubroVencimientosActivo(contexto, alerta.usuario, alerta.rubro)'), 'Recordatorios de lotes no filtran por rubro');
assert(db.includes('expirations_almacen_enabled') && db.includes('expirations_lacteos_enabled'), 'DB no persiste preferencias por rubro');
console.log('Notificaciones Vencimientos por rubro 24/09: OK');
