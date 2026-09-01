const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const server = read('server.js');
const db = read('db-auxiliares.js');
const front = read('notifications.js');
const center = read('notification-center.js');
const html = read('index.html');
const env = read('.env.example');

// Preferencias reales de servidor.
assert(db.includes('CREATE TABLE IF NOT EXISTS notification_preferences'), 'Falta persistencia PostgreSQL de preferencias');
assert(db.includes('expirations_enabled') && db.includes('tasks_enabled') && db.includes('bathroom_enabled'), 'Faltan las tres categorías nuevas');
assert(server.includes('app.get("/notificaciones/preferencias"') && server.includes('app.put("/notificaciones/preferencias"'), 'Faltan endpoints de preferencias');
assert(server.includes('categoriaNotificacionesActiva'), 'El backend debe consultar el interruptor antes de enviar');

// Vencimientos: solo alta inmediata + producto vencido a las 08:00.
assert(server.includes('await enviarAlertaNuevoVencimiento(registro);'), 'El alta de vencimiento debe notificar inmediatamente');
assert(server.includes('title: "Nuevo producto en vencimientos"'), 'Falta payload de producto nuevo');
assert(server.includes('Vence ${fechaVencimientoVisible(registro.vencimiento)} · ${unidades}'), 'Producto nuevo debe incluir fecha y cantidad');
assert(server.includes('title: "Producto vencido"'), 'Falta notificación individual de producto vencido');
assert(server.includes('body: `${registro.articulo} · Venció ${fechaVencimientoVisible(registro.vencimiento)}`'), 'Producto vencido debe incluir nombre y fecha sin cantidad');
assert(server.includes('dentro(8 * 60)'), 'Las reglas de las 08:00 deben quedar programadas desde las 08:00 AR con recuperación');
assert(server.includes('"vencimientos-vencidos-08", procesarProductosVencidos'), 'Vencidos deben procesarse a las 08:00');
assert(!server.includes('[1, 3, 7, 15]'), 'No deben quedar avisos previos de 1/3/7/15 días');
assert(!server.includes('resumen-vencimientos'), 'No debe quedar el resumen viejo de vencimientos');
assert(!server.includes('payloadResumenVencimientos'), 'No debe quedar el generador viejo de resúmenes');

// Tareas: mañana 08:00, tarde 15:00, y supervisor solo al completar.
assert(server.includes('procesarNotificacionesTareasPendientes("manana")'), 'Falta control de pendientes del turno mañana');
assert(server.includes('dentro(15 * 60)'), 'Falta ventana de ejecución desde las 15:00');
assert(server.includes('procesarNotificacionesTareasPendientes("tarde")'), 'Falta control de pendientes del turno tarde');
assert(server.includes('title: "Tareas pendientes"'), 'Falta notificación de tareas pendientes');
assert(server.includes('notificarSupervisorTareaCompletada({'), 'Debe conservarse aviso inmediato al supervisor al completar');
assert(server.includes('sector?.supervisor') || server.includes('sector.supervisor'), 'El supervisor debe salir del sector de la tarea');
assert(!server.includes('procesarNotificacionesInicioTareas'), 'No debe quedar la regla vieja basada en hora de entrada individual');
assert(!server.includes('tareas-inicio|'), 'No debe quedar deduplicación vieja de inicio de turno');
assert(!server.includes('horaInicioDesdeTurnoValor'), 'No debe quedar cálculo viejo de hora de entrada para notificaciones');

// Baño: categoría independiente, general 08:00 y recordatorio 18:00 si sigue pendiente.
assert(html.includes('<strong>Limpieza de baño</strong>'), 'Horarios debe reemplazarse por Limpieza de baño en Configuración');
assert(html.includes('id="settingsNotifBano"'), 'Falta interruptor Limpieza de baño');
assert(!html.includes('id="settingsNotifHorarios"'), 'No debe quedar el interruptor viejo Horarios');
assert(front.includes('settingsNotifBano: "bano"'), 'Frontend debe guardar la nueva categoría baño');
assert(center.includes('return prefs.bano !== false'), 'Centro de notificaciones debe filtrar baño por su propio interruptor');
assert(server.includes('usuariosCategoriaNotificaciones(contexto, "bano")'), 'Baño debe enviarse de forma general a usuarios con esa categoría activa');
assert(server.includes('dentro(18 * 60)'), 'Falta ventana de ejecución desde las 18:00');
assert(server.includes('procesarNotificacionBano("18")'), 'Falta procesamiento de baño de las 18:00');
assert(server.includes('tipo === "18" && limpiezaBanoConfirmada(config, fecha)'), 'A las 18:00 no debe avisar si ya está completado');
assert(server.includes('Boolean(normalizarTexto(item?.usuario))'), 'Baño solo debe considerarse completado cuando existe confirmación real del usuario');
assert(!server.includes('procesarNotificacionBano("16")'), 'No debe quedar recordatorio viejo de las 16:00');
assert(!server.includes('bano-16'), 'No debe quedar tag o clave vieja de baño 16:00');

// No quedan disparadores manuales/cron capaces de saltarse los horarios nuevos.
assert(!server.includes('app.post("/notificaciones/procesar"'), 'Debe eliminarse el disparador manual viejo de notificaciones');
assert(!server.includes('app.all("/notificaciones/cron"'), 'Debe eliminarse el cron viejo de notificaciones');
assert(!server.includes('NOTIFICATION_CRON_SECRET'), 'No debe quedar configuración del cron viejo');
assert(!env.includes('NOTIFICATION_CRON_SECRET'), '.env.example no debe conservar el cron viejo');

console.log('Reglas nuevas de notificaciones 01/09: OK');
