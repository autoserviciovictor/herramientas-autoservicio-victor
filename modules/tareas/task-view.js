import { escapeHTML, formatDuration } from '../../shared/dom-utils.js';

const PERSON_ICON = '<svg class="app-icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M6 20c.4-4 2.4-6 6-6s5.6 2 6 6"/></svg>';
const CLOCK_ICON = '<svg class="app-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const EDIT_ICON = '<svg class="app-icon" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
const DELETE_ICON = '<svg class="app-icon" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></svg>';
const CHECK_ICON = '<svg class="app-icon" viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg>';
const MORNING_ICON = '<svg class="app-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const EVENING_ICON = '<svg class="app-icon" viewBox="0 0 24 24"><path d="M20 15.5A8.5 8.5 0 118.5 4 7 7 0 0020 15.5z"/></svg>';

function responsibleNames(value) {
  return (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map(item => String(item || '').trim()).filter(Boolean);
}

export function responsibleBadges(value) {
  const names = responsibleNames(value);
  if (!names.length) return '<span class="tarea-persona sin-responsable">Sin responsable</span>';
  return names.map(name => `<span class="tarea-persona">${PERSON_ICON}${escapeHTML(name)}</span>`).join('');
}

function taskRowTemplate(task) {
  const completed = task.estado === 'completada';
  const duration = formatDuration(task.duracionMin);
  const actions = task._canManage
    ? `${completed ? '' : `<button type="button" data-accion="editar" class="task-action task-action-edit">${EDIT_ICON}<span>Editar</span></button><button type="button" data-accion="eliminar" class="task-action task-action-delete">${DELETE_ICON}<span>Eliminar</span></button><button type="button" data-accion="completar" class="task-action task-action-complete">${CHECK_ICON}<span>Completar</span></button>`}`
    : `${completed ? '' : `<button type="button" data-accion="completar" class="task-action task-action-complete">${CHECK_ICON}<span>Completar</span></button>`}`;
  return `<div class="tarea-item-row ${completed ? 'is-completed' : ''}" data-id="${escapeHTML(task.id)}" data-turno="${escapeHTML(task._turno)}">
    <div class="tarea-item-copy">
      <strong>${escapeHTML(task.nombre)}</strong>
      <span class="tarea-duration-pill">${CLOCK_ICON}${escapeHTML(duration)}</span>
    </div>
    <span class="tarea-row-status estado-${escapeHTML(task.estado)}">${completed ? 'Completada' : 'Pendiente'}</span>
    ${actions ? `<div class="tarea-row-actions ${task._canManage ? 'is-manager' : 'is-employee'}">${actions}</div>` : ''}
  </div>`;
}

function userCardTemplate(name, items, shift) {
  const completed = items.filter(item => item.estado === 'completada').length;
  const allDone = completed === items.length && items.length > 0;
  return `<article class="tarea-user-card ${allDone ? 'is-complete' : ''}">
    <header class="tarea-user-head">
      <div class="tarea-user-identity"><span class="tarea-user-avatar">${PERSON_ICON}</span><div><h4>${escapeHTML(name)}</h4><small>${shift === 'manana' ? 'Mañana' : 'Tarde'} · ${completed} de ${items.length} completadas</small></div></div>
      <span class="tarea-user-progress ${allDone ? 'is-complete' : ''}">${allDone ? 'Completado' : `${items.length} ${items.length === 1 ? 'tarea' : 'tareas'}`}</span>
    </header>
    <div class="tarea-user-items">${items.map(taskRowTemplate).join('')}</div>
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
  return [...groups.entries()].sort(([a],[b]) => a.localeCompare(b, 'es', {sensitivity:'base'}));
}

export function shiftSectionTemplate(shift, items) {
  const morning = shift === 'manana';
  const title = morning ? 'Mañana' : 'Tarde';
  const icon = morning ? MORNING_ICON : EVENING_ICON;
  const groups = groupByResponsible(items);
  return `<section class="tareas-turno-group tareas-turno-${shift}">
    <header class="tareas-turno-head"><span class="tareas-turno-icon">${icon}</span><div><h3>${title}</h3><small>${groups.length} ${groups.length === 1 ? 'persona' : 'personas'}</small></div></header>
    <div class="tareas-turno-list tareas-user-list">${groups.length ? groups.map(([name, group]) => userCardTemplate(name, group, shift)).join('') : '<div class="tareas-turno-empty">Sin tareas para este turno</div>'}</div>
  </section>`;
}

export function emptyTaskListTemplate() {
  return '<div class="tareas-empty tareas-empty-day"><span class="tareas-empty-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></span><strong>Sin tareas asignadas</strong><span>Usá “Asignar tarea” para organizar este día.</span></div>';
}
