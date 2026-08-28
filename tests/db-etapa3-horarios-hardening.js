const fs = require('fs');
const assert = require('assert');

const server = fs.readFileSync('server.js', 'utf8');
const db = fs.readFileSync('db-horarios.js', 'utf8');

assert(!db.includes('TRUNCATE schedule_calendar'), 'Calendario no debe truncarse globalmente');
assert(!db.includes('TRUNCATE schedule_personnel_order'), 'Orden de personal no debe truncarse globalmente');
assert(db.includes('pg_advisory_xact_lock'), 'Falta bloqueo transaccional PostgreSQL para escrituras concurrentes');
assert(db.includes('reemplazarCalendarioDetallesPorAlcances'), 'Falta escritura acotada por sector/mes');
assert(db.includes('DELETE FROM schedule_calendar WHERE sector_id=$1 AND month_key=$2'), 'Calendario debe reemplazarse solo por sector/mes');
assert(db.includes('DELETE FROM schedule_personnel_order WHERE sector_id=$1'), 'Orden debe reemplazarse solo por sector');

const inicioTurnos = server.indexOf('async function obtenerTurnosSector');
const finTurnos = server.indexOf('async function registrarAuditoriaHorario', inicioTurnos);
const bloqueTurnos = server.slice(inicioTurnos, finTurnos);
assert(!bloqueTurnos.includes('.slice(1)'), 'PostgreSQL no tiene fila de encabezado: no debe descartarse el primer turno');

assert(server.includes('diasEnMesHorarios'), 'Falta validación de días reales del mes');
assert(server.includes('identificadores repetidos'), 'Falta validación de IDs de turno duplicados');
assert(server.includes('registros duplicados para un mismo empleado y día'), 'Falta validación de celdas duplicadas');
assert(server.includes('conTransaccionHorarios(async (clienteHorarios)'), 'El guardado de calendario debe leer y escribir bajo la misma transacción/bloqueo');
assert(server.includes('listarCalendarioFilas(clienteHorarios)'), 'La lectura para control de concurrencia debe ocurrir dentro de la transacción');
assert(server.includes('registrarAuditoriaFilas(filas, clienteHorarios)'), 'La auditoría de cambios debe confirmarse junto con el calendario');

console.log('PostgreSQL Etapa 3 Horarios hardening tests: OK');
