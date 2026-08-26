const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

exigir(/tareas:\s*60000/.test(server), 'Tareas debe tener caché de lectura de 60 segundos');
exigir(/turnosHorarios:\s*300000/.test(server), 'Turnos debe reutilizar lecturas durante 5 minutos');
exigir(/leerConCache\("tareas",\s*CACHE_TTL\.tareas/.test(server), 'obtenerTareasServidor debe usar el caché compartido');
exigir(/obtenerTareasServidor\(\{\s*sinReintento:\s*true\s*\}\)/.test(server), 'El ciclo automático debe evitar reintentos multiplicativos de Gaxios');
exigir(/\{\s*retry:\s*false\s*\}/.test(server), 'Las lecturas del ciclo automático deben poder desactivar retry de Gaxios');
exigir(/promesaNotificacionesInicioTareas/.test(server), 'Debe existir bloqueo contra ejecuciones solapadas de notificaciones');
exigir(/PAUSA_CUOTA_NOTIFICACIONES_MS\s*=\s*70\s*\*\s*1000/.test(server), 'Debe existir enfriamiento breve después de un 429');
exigir(/horaEnVentanaNotificacion\(horaEntrada,\s*horaActual\)/.test(server), 'Debe existir ventana de recuperación para no perder avisos tras un 429');
exigir(/invalidarCache\("productos"\);\s*\n\s*producto\s*=\s*await buscarProductoPorCodigo\(codigoBuscado\)/.test(server), 'Guardar debe releer una vez ante un miss de producto');
exigir(/status >= 500\) console\.error\("Error en \/guardar:"/.test(server), 'Los 404 de /guardar no deben registrarse como error interno');

console.log('Cuota Sheets + /guardar 26/08: OK');
