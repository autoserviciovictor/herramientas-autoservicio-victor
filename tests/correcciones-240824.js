const fs = require('fs');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const html = fs.readFileSync('index.html','utf8');
const css = fs.readFileSync('ui-unification.css','utf8');
const app = fs.readFileSync('app.js','utf8');
const horarios = fs.readFileSync('horarios-redesign.css','utf8');
const tareas = fs.readFileSync('tareas-redesign.css','utf8');

assert(html.includes('<small>artículos</small>'), 'Inicio debe decir artículos');
assert(html.includes('id="proBathroomStatus"'), 'Banner de baño debe tener estado dinámico');
assert(css.includes('align-self: end !important') && css.includes('padding: 0 0 2px !important'), 'Texto secundario KPI debe apoyar en la base del número');
assert(css.includes('body.en-inicio #pantallaInicio .pro-mobile-welcome') && css.includes('display: none !important'), 'Inicio móvil debe ocultar saludo/estado');
assert(css.includes('body.en-inicio #pantallaInicio.pantalla-inicio.pro-dashboard') && css.includes('padding-top: 26px !important'), 'Inicio desktop debe usar altura canónica');
assert(tareas.includes('body.en-tareas #tareasVistaPlanificacion .tareas-subpage-head') && tareas.includes('body.en-tareas #tareasVistaConfig .tareas-subpage-head') && tareas.includes('display: none !important;'), 'Planificación/config deben respetar el encabezado móvil canónico');
assert(app.includes('actualizarResponsableBanoInicio') && app.includes('Hoy le toca limpiar a ${nombre}.'), 'Inicio debe mostrar responsable real del baño');
assert(horarios.includes('width: 42px !important') && tareas.includes('width: 42px !important'), 'Botones volver deben ser cuadrados');
assert(horarios.includes('display: none !important;') && tareas.includes('display: none !important;'), 'Etiqueta del botón volver debe permanecer oculta');
console.log('Correcciones UI 24/08: OK');
