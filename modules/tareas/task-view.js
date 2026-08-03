import { escapeHTML, formatDuration } from '../../shared/dom-utils.js';

const PERSON_ICON = '<svg class="app-icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M6 20c.4-4 2.4-6 6-6s5.6 2 6 6"/></svg>';
const CLOCK_ICON = '<svg class="app-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const MORNING_ICON = '<svg class="app-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const EVENING_ICON = '<svg class="app-icon" viewBox="0 0 24 24"><path d="M20 15.5A8.5 8.5 0 118.5 4 7 7 0 0020 15.5z"/></svg>';

export function responsibleBadges(value) {
  const names = Array.isArray(value)
    ? value
    : String(value ?? '').split(',').map(item => item.trim()).filter(Boolean);
  if (!names.length) return '<span class="tarea-persona sin-responsable">Sin responsable</span>';
  return names.map(name => `<span class="tarea-persona">${PERSON_ICON}${escapeHTML(name)}</span>`).join('');
}

export function taskCardTemplate(task) {
  const completed = task.estado === 'completada';
  const assignment = task._asignacion || {};
  const duration = formatDuration(task.duracionMin);
  const completion = completed
    ? `<small class="tarea-completion-copy">por ${escapeHTML(assignment.completadaPor || 'Usuario')}${assignment.completadaHora ? ` · ${escapeHTML(assignment.completadaHora)}` : ''}</small>`
    : '';
  return `<article class="tarea-card tarea-card-v1201" data-id="${escapeHTML(task.id)}" data-turno="${escapeHTML(task._turno)}">
    <div class="tarea-card-main">
      <div class="tarea-card-title">
        <h3>${escapeHTML(task.nombre)}</h3>
        <span class="tarea-duration-pill" aria-label="Duración: ${escapeHTML(duration)}">${CLOCK_ICON}${escapeHTML(duration)}</span>
      </div>
      <div class="tarea-compact-meta">
        <strong>${escapeHTML(task.sector || 'General')}</strong>
        <span class="tarea-meta-separator">•</span>
        <div class="tarea-assignment">${responsibleBadges(assignment.responsables)}</div>
      </div>
    </div>
    <footer class="tarea-card-footer estado-${escapeHTML(task.estado)}">
      <div class="tarea-state-copy"><strong><span class="estado-dot"></span>${completed ? 'COMPLETADA' : 'PENDIENTE'}</strong>${completion}</div>
      <div class="tarea-card-actions">
        ${completed ? '' : '<button type="button" data-accion="completar" class="tarea-action-complete">Completar</button>'}
        ${task._canManage ? '<button type="button" data-accion="editar">Editar</button><button type="button" data-accion="eliminar" class="danger tarea-action-delete" aria-label="Eliminar tarea"><span class="tarea-delete-text">Eliminar</span><span class="tarea-delete-short">×</span></button>' : ''}
      </div>
    </footer>
  </article>`;
}

export function shiftSectionTemplate(shift, items) {
  const morning = shift === 'manana';
  const title = morning ? 'Mañana' : 'Tarde';
  const icon = morning ? MORNING_ICON : EVENING_ICON;
  return `<section class="tareas-turno-group tareas-turno-${shift}">
    <header class="tareas-turno-head"><span class="tareas-turno-icon">${icon}</span><div><h3>${title}</h3><small>${items.length} ${items.length === 1 ? 'tarea' : 'tareas'}</small></div></header>
    <div class="tareas-turno-list">${items.length ? items.map(taskCardTemplate).join('') : '<div class="tareas-turno-empty">Sin tareas para este turno</div>'}</div>
  </section>`;
}

export function emptyTaskListTemplate() {
  return '<div class="tareas-empty tareas-empty-day"><span class="tareas-empty-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></span><strong>Sin tareas asignadas</strong><span>Usá “Asignar tarea” para organizar este día.</span></div>';
}
