const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'tareas-redesign.css'), 'utf8');
const uiCss = fs.readFileSync(path.join(root, 'ui-unification.css'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error(`ERROR etapa 3 CSS: ${msg}`);
    process.exit(1);
  }
}

assert(!css.includes('@media/*'), 'no debe quedar el @media legado/malformado');
assert(!css.includes('grid-template-columns: minmax(0, 1fr) auto !important;'), 'no debe quedar la grilla móvil antigua de Configuración de Tareas');
assert((css.match(/grid-template-columns:28px minmax\(0,1fr\) 44px !important;/g) || []).length === 1,
  'debe existir una sola grilla móvil canónica para Configuración de Tareas');
assert(css.includes('overflow-wrap:break-word !important;'), 'el nombre de tarea móvil debe envolver palabras sin partirlas letra por letra');
assert(!css.includes('.bano-current-modern.is-rest {\n  background: var(--task-surface) !important;'),
  'no debe quedar la apariencia antigua de descanso que luego era reemplazada');
assert(!css.includes('.bano-config-modern { max-width: 1050px !important; }'),
  'no debe quedar el ancho antiguo de Configuración de Baño');
assert((css.match(/body\.en-bano #pantallaBano \.bano-panel-head \{ gap:12px; \}/g) || []).length === 0,
  'no debe quedar el override redundante de gap del encabezado de Baño');
assert(css.includes('body.en-tareas #pantallaTareas .config-task-order-footer {\n  display:flex;'),
  'el footer de guardado de orden debe ser una regla CSS válida');
assert(!uiCss.includes('#pantallaTareas .config-task-row { min-height: 102px !important; }'),
  'ui-unification no debe volver a imponer la altura móvil vieja sobre las tarjetas de Configuración');

console.log('OK etapa 3: CSS de Tareas/Baño consolidado sin condiciones antiguas detectadas');
