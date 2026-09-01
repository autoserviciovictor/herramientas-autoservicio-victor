const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const server = read('server.js');
const db = read('db-auxiliares.js');
const front = read('notifications.js');
const center = read('notification-center.js');

// PostgreSQL es la fuente oficial de preferencias; localStorage queda aislado por usuario.
assert(front.includes('async function cargarPreferenciasRemotas()'), 'Falta lectura remota de preferencias');
assert(front.includes('const remotas = await cargarPreferenciasRemotas();'), 'El login debe leer PostgreSQL antes de actualizar localStorage');
assert(!front.includes('const prefs = preferenciasCategorias();\n  try {\n    const guardadas = await guardarPreferenciasRemotas(prefs);'), 'No debe subirse localStorage al iniciar sesión');
assert(front.includes('CATEGORIAS_KEY_BASE') && front.includes('claveCategoriasUsuario()'), 'Las preferencias locales deben estar separadas por usuario');
assert(center.includes('claveCategoriasUsuario()'), 'El centro de notificaciones debe usar preferencias locales por usuario');

// El programador diario debe sobrevivir reinicios y recuperar horarios pendientes.
assert(db.includes('CREATE TABLE IF NOT EXISTS notification_schedule_runs'), 'Falta persistencia de ejecuciones programadas');
assert(server.includes('notificacionHorarioEjecutadaDb(fecha, clave)'), 'El scheduler debe consultar PostgreSQL antes de ejecutar');
assert(server.includes('registrarNotificacionHorarioEjecutadaDb(fecha, clave)'), 'El scheduler debe registrar la ejecución completada');
assert(server.includes('dentro(8 * 60, 15 * 60)'), 'Tareas mañana debe recuperarse después de 08:00 y antes de 15:00');
assert(server.includes('dentro(8 * 60, 18 * 60)'), 'Baño 08 debe recuperarse después de 08:00 y antes de 18:00');
assert(server.includes('dentro(15 * 60)'), 'Tareas tarde debe recuperarse si Render vuelve después de 15:00');
assert(server.includes('dentro(18 * 60)'), 'Baño 18 debe recuperarse si Render vuelve después de 18:00');

// Un fallo real del proveedor no puede marcar la entrega como exitosa.
assert(server.includes('function entregaPushRequiereReintento(resultado)'), 'Falta clasificación explícita de entrega fallida');
assert(server.includes('if (entregaPushRequiereReintento(resultado))'), 'Las reglas deben detener el registro de enviado si el proveedor falla');
assert(server.includes('retryNeeded = true'), 'El scheduler debe volver a intentar entregas transitorias fallidas');

// Vencimientos depende de su alerta, no del permiso de acceso al módulo.
assert(server.includes('usuariosCategoriaNotificaciones(contexto, "vencimientos")'), 'Vencimientos debe filtrar por la categoría activa');
assert(!server.includes('usuariosCategoriaNotificaciones(contexto, "vencimientos", "vencimientos")'), 'Vencimientos no debe exigir además permiso al módulo');

// Entregas generales se deduplican por usuario para no reenviar a quienes ya recibieron.
assert(server.includes('const claveUsuario = `${claveBase}|${normalizarUsuario(usuario.usuario)}`'), 'Baño debe deduplicar entrega por usuario');
assert(server.includes('const claveUsuario = `${clave}|${normalizarUsuario(usuario.usuario)}`'), 'Vencimientos debe deduplicar entrega por usuario');

console.log('Robustez final de notificaciones 01/09: OK');
