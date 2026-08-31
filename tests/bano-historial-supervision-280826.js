const fs = require('fs');
const assert = (v, m) => { if (!v) throw new Error(m); };
const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('tareas.js', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const db = fs.readFileSync('db-tareas-bano.js', 'utf8');
const css = fs.readFileSync('tareas-redesign.css', 'utf8');

for (const titulo of ['Fecha','Responsable de limpieza','Confirmación responsable','Supervisado por','Confirmación de limpieza']) {
  assert(js.includes(titulo), `Falta columna ${titulo}`);
}
assert(html.includes('Historial de confirmaciones'), 'Debe mostrarse Historial de confirmaciones');
assert(js.includes('Confirmado') && js.includes('Sin confirmar'), 'Faltan etiquetas Confirmado/Sin confirmar');
assert(js.includes('/tareas/bano/verificar'), 'Falta acción de verificación en frontend');
assert(server.includes('app.post("/tareas/bano/verificar"'), 'Falta endpoint de verificación');
assert(server.includes('rolGestionSector(req.usuario)'), 'La verificación debe restringirse a gestión/supervisión');
assert(db.includes('responsible_key') && db.includes('verified_by') && db.includes('verified_time'), 'Faltan campos persistentes de responsable/verificación');
assert(server.includes('participantesOrdenFijo') && server.includes('fechaAnclaParaConservarTurno'), 'La rotación debe conservar orden y turno al agregar/eliminar');
assert(js.includes('banoParticipantesBorrador'), 'La selección debe conservar orden incluso al buscar/agregar');
assert(css.includes('.bano-history-table') && css.includes('.bano-history-verify'), 'Falta diseño del historial/verificación');

assert(js.includes('const historial = hist.slice(0, 6)'), 'El historial principal debe mostrar como máximo 6 registros');
assert(html.includes('btnBanoPlanilla'), 'Debe existir el acceso a la planilla mensual');
assert(js.includes('disabled aria-disabled=\"true\" title=\"El responsable todavía no confirmó la limpieza\"'), 'El botón Confirmar debe verse deshabilitado hasta que confirme el responsable');
assert(css.includes('font-size: 12.5px !important'), 'La tipografía del historial debe ser más grande');
console.log('Baño historial completo, supervisión, orden fijo y legibilidad: OK');
