const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const html = read("index.html");
const style = read("style.css");
const components = read("design-components.css");
const horariosCss = read("horarios-redesign.css");
const horarios = read("horarios.js");
const app = read("app.js");
const repo = read("reposicion.js");
const prices = read("prices.js");
const loader = read("product-loader.js");

// 1 + 13 · Lista: pestañas dentro de la columna principal y un único eje móvil.
const mainPos = html.indexOf('class="repo-main-column"');
const tabsPos = html.indexOf('class="repo-list-selector"', mainPos);
const mainCardPos = html.indexOf('class="repo-main-card"', tabsPos);
const sidePos = html.indexOf('class="repo-side-column"', mainCardPos);
assert(mainPos >= 0 && tabsPos > mainPos && mainCardPos > tabsPos && sidePos > mainCardPos,
  "Lista debe organizar pestañas + contenido en columna principal y resumen en columna lateral");
assert(style.includes('#pantallaAnotar .repo-main-column') && style.includes('grid-template-rows: auto auto'),
  "Lista PC debe tener columna principal canónica");
assert(style.includes('#pantallaAnotar .repo-main-column,') && style.includes('#pantallaAnotar .repo-recent-card {') && style.includes('box-sizing:border-box'),
  "Lista móvil debe compartir un único ancho/eje");

// 2 + 14 · Calendario legible sin perder contratos de PC/móvil.
assert(horariosCss.includes('font-size: 12.5px !important') && horariosCss.includes('font-size: 13.5px !important'),
  "Calendario debe usar tipografía legible para nombres, fechas y celdas");
assert(horariosCss.includes('width: 1686px !important') && horariosCss.includes('width: 50px !important'),
  "Calendario móvil debe dar más ancho real a cada día y conservar scroll horizontal");
assert(horariosCss.includes('overflow-x: auto !important') && horariosCss.includes('overflow-y: visible !important'),
  "Calendario móvil debe usar solo scroll horizontal interno");
assert(!style.includes('/* Calendario: el mes completo entra en el ancho disponible sin barra inferior. */'),
  "style.css no debe conservar el bloque histórico que achicaba el calendario");

// 3 + 15 · Eje global para vistas secundarias y tarjeta roja idéntica.
assert(!horariosCss.includes('1080px') && !horariosCss.includes('980px'),
  "Mis horarios/Configuración no deben conservar anchos históricos propios");
assert(horariosCss.includes('body.en-horarios.horarios-vista-mio #horariosMioView') && horariosCss.includes('max-width: none !important'),
  "Mis horarios debe usar ancho global");
assert(horariosCss.includes('body.en-horarios.horarios-vista-config #horariosConfigView'),
  "Configuración debe tener contrato de ancho global");
assert((html.match(/horarios-hoy-card--shared/g) || []).length === 2,
  "Las dos tarjetas rojas deben compartir el mismo componente");
assert(horariosCss.includes('height: 108px !important') && horariosCss.includes('max-height: 108px !important') && horariosCss.includes('height: 100px !important'),
  "La tarjeta roja debe tener dimensiones reales compartidas en PC y móvil");

// 4 · Scrollbar tematizado y no oculto en superficies internas.
assert(components.includes('scrollbar-color: var(--pro-border-strong, #405772) var(--pro-bg, #071321) !important'),
  "Dark mode debe tematizar el scrollbar interno desde tokens globales");
assert(components.includes('.app-choice-list,') && components.includes('.product-loader-dialog,') && components.includes('.product-loader-suggestions,'),
  "Selector de horario y cargadores deben compartir scrollbar");
assert(!components.includes('.product-loader-dialog::-webkit-scrollbar { display: none !important; }'),
  "El cargador no debe ocultar el scrollbar que necesita tematizarse");

// 5 + 6 · Un único sistema de Cargar producto basado en Vencimientos.
for (const id of ["inventarioCargaModal", "vencCargaModal", "repoCargaModal", "precioConsultaModal"]) {
  const pos = html.indexOf(`id="${id}"`);
  assert(pos >= 0, `Falta ${id}`);
  const fragment = html.slice(pos, pos + 6500);
  assert(fragment.includes('product-loader-dialog'), `${id} debe usar diálogo compartido`);
  assert(fragment.includes('product-loader-kicker">PRODUCTOS</span>'), `${id} debe usar el kicker PRODUCTOS`);
  assert(fragment.includes('>Cargar producto</h2>'), `${id} debe titular Cargar producto`);
  assert(fragment.includes('Escaneá un código o buscá el producto manualmente.'), `${id} debe usar el mismo texto introductorio`);
  assert(fragment.includes('product-loader-inline-alert'), `${id} debe tener error de cámara inline`);
  assert(fragment.includes('>Usar cámara</span>') || fragment.includes('>Usar cámara</button>'), `${id} debe ofrecer Usar cámara`);
  assert(fragment.includes('Ingresar producto manual'), `${id} debe ofrecer ingreso manual`);
  assert(fragment.includes('product-loader-search-row'), `${id} debe usar búsqueda manual compartida`);
}
for (const file of [app, repo, prices]) {
  assert(file.includes('PRODUCT_LOADER_CAMERA_ERROR'), "Todos los módulos deben usar el mismo mensaje de cámara");
  assert(file.includes('establecerModoCargaProducto'), "Todos los módulos deben usar el controlador común de carga");
}
assert(loader.includes('No se pudo iniciar la cámara. Revisá los permisos del navegador o usá el ingreso manual.'),
  "El mensaje canónico de permisos de cámara debe coincidir con Vencimientos");
assert(!app.includes('mostrarMensaje("Escáner activo"') && !repo.includes('toast("Escáner activo"') && !prices.includes('toast("Escáner activo"'),
  "No deben quedar toasts de escáner detrás de los modales");
assert(!style.includes('.inventory-scan-modal{') && !style.includes('#repoCargaModal .repo-scan-sheet') && !style.includes('#vencCargaModal .product-loader-dialog'),
  "style.css no debe conservar shells visuales independientes de Cargar producto");
assert(components.includes('width: min(640px, calc(100vw - 48px)) !important'),
  "Todos los cargadores deben compartir las mismas medidas desktop");

// 7 · Badges de cantidad de Vencimientos legibles.
const badgeRule = style.match(/#pantallaVencimientos \.venc-range-group__header > strong \{([\s\S]*?)\n\}/)?.[1] || "";
assert(badgeRule.includes('font-size:12.5px') && badgeRule.includes('min-height:28px'),
  "Los contadores de productos en Vencimientos deben ser legibles");

// 8-11 · Controles superiores de Horarios simplificados.
assert(horariosCss.includes('#horariosSectorSelectorButton') && horariosCss.includes('justify-content: center !important'),
  "El nombre del sector debe quedar centrado");
assert(!horarios.includes('horarios-config-chevron') && horarios.includes('horarios-control-spacer'),
  "Configuración no debe tener flecha de desplegable");
assert(horariosCss.includes('.horarios-config-copy') && horariosCss.includes('text-align: center !important'),
  "Configuración debe quedar centrada");
assert(horarios.includes('function nombreMesControlCalendario()') && horarios.includes('month: "long"'),
  "El selector principal debe mostrar solo el nombre del mes");
assert(!horarios.includes('horariosModoDetalle') && horarios.includes('id="horariosModoEstado"'),
  "Modo lectura/edición no debe conservar texto explicativo cortado");

// 12 · Editar stock: X cancela, Guardar + Eliminar con acción real.
assert(!html.includes('id="btnCancelarCorreccion"'), "Editar stock no debe conservar Cancelar inferior");
assert(html.includes('id="btnEliminarStockInventario"'), "Editar stock debe tener Eliminar");
assert(html.includes('class="inventory-edit-modal-actions edit-modal-actions-standard"'),
  "Editar stock debe usar acciones visuales estandarizadas");
assert(app.includes('async function eliminarStockInventario()') && app.includes('modificarStockProducto(productoEditando.indice, 0, 0)'),
  "Eliminar stock debe ejecutar una eliminación segura del stock cargado");
assert(app.includes('titulo: "Eliminar producto del inventario"'), "Eliminar stock debe pedir confirmación");

console.log("Correcciones post-Entrega 5 regression tests: OK");
