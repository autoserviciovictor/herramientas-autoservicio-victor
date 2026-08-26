const fs = require('fs');
const assert = require('assert');

const shell = fs.readFileSync('app-shell.css', 'utf8');
const tareas = fs.readFileSync('tareas-redesign.css', 'utf8');
const settings = fs.readFileSync('settings-user.css', 'utf8');
const ui = fs.readFileSync('ui-unification.css', 'utf8');
const horarios = fs.readFileSync('horarios-redesign.css', 'utf8');
const style = fs.readFileSync('style.css', 'utf8');

assert(shell.includes('--app-shell-mobile-top-gap: 12px;'), 'falta gap móvil canónico');
assert(shell.includes('#pantallaAjustes > .user-settings-shell'), 'Configuración no usa el eje móvil canónico');
assert(tareas.includes('width: calc(100% - (var(--app-shell-mobile-inline, 12px) * 2)) !important;'), 'Tareas/Baño no consumen el gutter canónico');

assert(!tareas.includes('width: calc(100% - 20px) !important;'), 'quedó el ancho móvil viejo de Tareas/Baño');
assert(!tareas.includes('width: min(1180px, calc(100% - 48px));'), 'quedó el ancho base viejo de Baño');
assert(!settings.includes('padding-inline: 12px !important;'), 'Configuración mantiene gutter propio duplicado');
assert(!ui.includes('--app-mobile-gutter:'), 'ui-unification conserva gutter duplicado');
assert(!ui.includes('--app-mobile-top-gap:'), 'ui-unification conserva top-gap duplicado');
assert(horarios.includes('padding-top: var(--app-shell-mobile-top-gap, 12px)'), 'Horarios no usa el arranque móvil común');
assert(style.includes('padding: var(--app-shell-mobile-top-gap, 12px) 0 96px;'), 'Inventario no usa el arranque móvil común');
assert(style.includes('padding: var(--app-shell-mobile-top-gap, 12px) 0 calc(92px + env(safe-area-inset-bottom));'), 'Vencimientos no usa el arranque móvil común');
assert(style.includes('padding: var(--app-shell-mobile-top-gap, 12px) 0 calc(178px + env(safe-area-inset-bottom)) !important;'), 'Lista no usa el arranque móvil común');
assert(style.includes('padding: var(--app-shell-mobile-top-gap, 12px) 0 calc(128px + env(safe-area-inset-bottom)) !important;'), 'Precios no usa el arranque móvil común');

console.log('OK auditoría móvil etapa 3: ancho y arranque vertical unificados sin gutters viejos duplicados.');
