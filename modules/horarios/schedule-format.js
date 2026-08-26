/** Formateo puro de turnos y estados especiales del calendario. */
function parseSimpleShift(id) {
  const match = String(id || '').match(/^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  return {
    inicioH: Number(match[1]), inicioM: Number(match[2] || 0),
    finH: Number(match[3]), finM: Number(match[4] || 0)
  };
}

function time24(hours, minutes = 0) {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function shiftDefinition(id, definitions) {
  return definitions.find(item => item.id === id) || null;
}

export function shiftSegments(id, definitions) {
  const definition = shiftDefinition(id, definitions);
  if (definition?.inicio && definition?.fin) {
    const segments = [{ inicio: definition.inicio, fin: definition.fin }];
    if (definition.tipo === 'cortado' && definition.inicio2 && definition.fin2) {
      segments.push({ inicio: definition.inicio2, fin: definition.fin2 });
    }
    return segments;
  }
  const parsed = parseSimpleShift(id);
  return parsed ? [{ inicio: time24(parsed.inicioH, parsed.inicioM), fin: time24(parsed.finH, parsed.finM) }] : [];
}

export function isSplitShift(id, definitions) {
  return shiftSegments(id, definitions).length > 1;
}

export function cellLabel(id, definitions) {
  if (!id) return '—';
  const special = { franco: 'F', vacaciones: 'V', ausente: 'A', licencia: 'L' };
  if (special[id]) return special[id];
  if (isSplitShift(id, definitions)) return 'C';
  const first = shiftSegments(id, definitions)[0];
  return first
    ? `${String(first.inicio).slice(0, 2)}\n${String(first.fin).slice(0, 2)}`
    : '—';
}

export function fullScheduleLabel(id, definitions) {
  if (!id) return 'Sin asignar';
  const special = { franco: 'Franco', vacaciones: 'Vacaciones', ausente: 'Ausente', licencia: 'Licencia' };
  if (special[id]) return special[id];
  const segments = shiftSegments(id, definitions);
  return segments.length ? segments.map(item => `${item.inicio} - ${item.fin}`).join(' / ') : 'Sin asignar';
}
