const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const css = read('tareas-redesign.css');
const js = read('tareas.js');

function ok(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  }
}

// Los tres modales se cierran desde la X: no debe haber un segundo botón Cancelar.
ok(!html.includes('id="btnCancelarTarea"'), 'Editar tarea no debe conservar botón Cancelar');
ok(!html.includes('id="btnCancelarAsignar"'), 'Editar tareas por usuario no debe conservar botón Cancelar');
ok(!js.includes('tareas-plan-modal-cancel'), 'Asignar usuarios desde planificación no debe conservar botón Cancelar');

// Editar tarea usa el sistema visual moderno y conserva estado + eliminación.
ok(html.includes('id="tareaEstadoSelector"'), 'Editar tarea debe permitir seleccionar Activa/Desactiva');
ok(html.includes('data-tarea-estado="activa"') && html.includes('data-tarea-estado="inactiva"'), 'Editar tarea debe mostrar ambos estados');
ok(html.includes('id="btnEliminarTarea"'), 'Editar tarea debe conservar la acción Eliminar');
ok(js.includes('tareaEstadoSeleccionado'), 'el estado elegido debe persistirse desde JS');

// Edición diaria: ambos turnos disponibles y todos los usuarios visibles/seleccionables.
ok(js.includes('renderTurnosAsignacion(["manana", "tarde"], turno)'), 'Editar tareas debe permitir alternar Mañana y Tarde');
ok(js.includes('usuariosAsignadosEnTurno(turno)'), 'la lista debe incluir responsables ya asignados aunque el calendario cambie');
ok(js.includes('usuariosDisponiblesCalendario(turno)'), 'la lista debe consultar todos los usuarios que trabajan en el turno');
ok(/type="radio" name="asignarUsuarioRadio"/.test(js), 'los usuarios del turno deben poder seleccionarse');
ok(js.includes('cargarTareasUsuarioAsignacion()'), 'cambiar de usuario debe recargar sus tareas');
ok(js.includes('También: ${otros.join(", ")}'), 'cada tarea debe informar otros responsables ya asignados');
ok(!js.includes('Consultando horario de la jornada'), 'no debe quedar el placeholder antiguo del responsable fijo');

// Planificación semanal mantiene asignación múltiple por tarea.
ok(js.includes('Asignar usuarios a la tarea'), 'el modal semanal debe usar el nuevo título profesional');
ok(js.includes('planModalEstado.seleccionados.add(nombre)'), 'la planificación debe permitir agregar varios responsables');
ok(js.includes('planModalEstado.seleccionados.delete(existente)'), 'la planificación debe permitir quitar responsables');
ok(/\.tareas-plan-modal-actions-main\s*\{[^}]*grid-template-columns:\s*1fr\s*!important/s.test(css), 'el modal semanal debe dejar Guardar como única acción inferior');

// Una sola sección canónica de modales en la hoja del módulo.
ok((css.match(/Modales canónicos de Tareas/g) || []).length === 1, 'debe existir una sola sección canónica de estilos para los modales');

if (!process.exitCode) console.log('Tareas modales modernos: OK');
