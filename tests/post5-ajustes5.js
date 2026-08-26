const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const components = read('design-components.css');
const horarios = read('horarios-redesign.css');
const style = read('style.css');
const version = JSON.parse(read('version.json'));

// Loader compartido: el header debe respetar las esquinas superiores aunque el diálogo use overflow visible.
const head = components.match(/\.product-loader-head \{([\s\S]*?)\n\}/)?.[1] || '';
assert(head.includes('border-radius: 19px 19px 0 0 !important'),
  'El header del loader debe redondear explícitamente las esquinas superiores');
assert(components.includes('border-radius: 20px 20px 0 0 !important;'),
  'El header/dialog móvil debe conservar esquinas superiores redondeadas');

// Calendario: el fondo de cada turno configurable debe ser opaco respecto de la superficie,
// para que hoy/feriado se vea detrás sin mezclar ni modificar el color del chip.
const configurable = horarios.match(/\.horario-cell\.turno-configurable \{([\s\S]*?)\n\}/)?.[1] || '';
assert(configurable.includes('color-mix(in srgb, var(--turno-color) 14%, var(--horarios-surface))'),
  'Los turnos configurables deben usar un fondo opaco basado en la superficie');
assert(!configurable.includes('background: var(--turno-fondo)'),
  'El calendario no debe usar el fondo semitransparente histórico del turno');
assert(!style.includes('.turno-configurable{\n  background: var(--turno-fondo)'),
  'No debe quedar la regla global histórica que vuelve semitransparente el turno');
assert(horarios.includes('.horarios-table .dia-feriado') && horarios.includes('.horarios-table .dia-hoy'),
  'Hoy y feriados deben mantener su resaltado de fondo');
assert(!/dia-(?:hoy|feriado)[^\{]*\.horario-cell\s*\{[^}]*background\s*:/s.test(horarios),
  'Hoy/feriado no deben pintar directamente los cuadrados de horarios');

assert(/^1960-d21-/.test(version.assetBuild), 'Build final inesperado');
console.log('Ajustes post-E5 ronda 5 regression tests: OK');
