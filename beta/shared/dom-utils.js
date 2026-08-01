/** Utilidades DOM compartidas por los módulos de la aplicación. */
export function escapeHTML(value) {
  const node = document.createElement('div');
  node.textContent = value ?? '';
  return node.innerHTML;
}

export function formatDuration(totalMinutes) {
  const total = Number(totalMinutes);
  if (!Number.isFinite(total) || total <= 0) return 'Sin duración';
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours && minutes) return `${hours} h ${minutes} min`;
  if (hours) return `${hours} h`;
  return `${minutes} min`;
}

export function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}
