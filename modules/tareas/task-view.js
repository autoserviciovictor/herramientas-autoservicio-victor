import { escapeHTML, formatDuration } from '../../shared/dom-utils.js?v=1960-d21-limpieza-controlada-270826-a';

const CLOCK_ICON = '<svg class="app-icon"><use href="#icon-clock"></use></svg>';
const EDIT_ICON = '<svg class="app-icon"><use href="#icon-edit"></use></svg>';
const CHECK_ICON = '<svg class="app-icon"><use href="#icon-check"></use></svg>';
const MORNING_ICON = '<svg class="app-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const EVENING_ICON = '<svg class="app-icon" viewBox="0 0 24 24"><path d="M20 15.5A8.5 8.5 0 118.5 4 7 7 0 0020 15.5z"/></svg>';

function responsibleNames(value) {
  return (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map(item => String(item || '').trim())
    .filter(Boolean);
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || '?';
}

function taskRowTemplate(task) {
  const completed = task.estado === 'completada';
  const duration = formatDuration(task.duracionMin);
  return `<label class="tarea-item-row tarea-check-row ${completed ? 'is-completed' : ''}" data-id="${escapeHTML(task.id)}" data-turno="${escapeHTML(task._turno)}">
    <input class="tarea-complete-check" type="checkbox" ${completed ? 'checked disabled' : ''} aria-label="Marcar ${escapeHTML(task.nombre)} como completada">
    <span class="tarea-check-visual">${CHECK_ICON}</span>
    <span class="tarea-item-copy"><strong>${escapeHTML(task.nombre)}</strong><span class="tarea-duration-pill">${CLOCK_ICON}${escapeHTML(duration)}</span></span>
  </label>`;
}

function userCardTemplate(name, items, shift) {
  const completed = items.filter(item => item.estado === 'completada').length;
  const total = items.length;
  const allDone = completed === total && total > 0;
  const canManage = items.some(item => item._canManage);
  const progress = total ? Math.round((completed / total) * 100) : 0;
  return `<article class="tarea-user-card ${allDone ? 'is-complete' : ''}" data-responsable="${escapeHTML(name)}" data-turno="${escapeHTML(shift)}">
    <header class="tarea-user-head">
      <div class="tarea-user-identity">
        <span class="tarea-user-avatar" aria-hidden="true">${escapeHTML(initials(name))}</span>
        <div><h4>${escapeHTML(name)}</h4><small>${shift === 'manana' ? 'Mañana' : 'Tarde'} · ${completed} de ${total} completadas</small></div>
      </div>
      <div class="tarea-user-progress-box"><span class="tarea-user-progress ${allDone ? 'is-complete' : ''}">${completed}/${total}</span><small>${progress}%</small></div>
    </header>
    <div class="tarea-user-progress-line"><i style="width:${progress}%"></i></div>
    <div class="tarea-user-items">${items.map(taskRowTemplate).join('')}</div>
    ${canManage ? `<footer class="tarea-user-footer"><button type="button" class="tarea-user-edit" data-accion="editar-usuario">${EDIT_ICON}<span>Editar tareas</span></button></footer>` : ''}
  </article>`;
}

function groupByResponsible(items) {
  const groups = new Map();
  for (const item of items) {
    const names = responsibleNames(item._asignacion?.responsables);
    const targetNames = names.length ? names : ['Sin responsable'];
    for (const name of targetNames) {
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(item);
    }
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

export function shiftSectionTemplate(shift, items) {
  const morning = shift === 'manana';
  const title = morning ? 'Mañana' : 'Tarde';
  const icon = morning ? MORNING_ICON : EVENING_ICON;
  const groups = groupByResponsible(items);
  return `<section class="tareas-turno-group tareas-turno-${shift}">
    <header class="tareas-turno-head">
      <span class="tareas-turno-icon">${icon}</span>
      <div><h3>${title}</h3><small>${groups.length} ${groups.length === 1 ? 'persona' : 'personas'}</small></div>
      <span class="tareas-turno-line" aria-hidden="true"></span>
    </header>
    <div class="tareas-turno-list tareas-user-list tareas-user-count-${Math.min(groups.length, 3)} ${groups.length > 3 ? 'tareas-user-count-many' : ''}">${groups.length ? groups.map(([name, group]) => userCardTemplate(name, group, shift)).join('') : '<div class="tareas-turno-empty">Sin tareas para este turno</div>'}</div>
  </section>`;
}

export function emptyTaskListTemplate() {
  return '<div class="tareas-empty tareas-empty-day"><span class="tareas-empty-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></span><strong>Sin tareas asignadas</strong><span>Abrí Planificación semanal para organizar esta jornada.</span></div>';
}
