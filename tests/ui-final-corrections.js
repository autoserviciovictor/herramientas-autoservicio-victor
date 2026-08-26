const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const app = read('app.js');
const admin = read('admin.js');
const tareas = read('tareas.js');
const horarios = read('horarios.js');
const settings = read('settings-user.css');
const pro = read('pro-ui.js');
const unified = read('ui-unification.css');
const shell = read('app-shell.css');

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

// Sidebar limpio: una etiqueta por variante (desktop + drawer móvil).
const labels = [...html.matchAll(/<p class="pro-nav-label">MÓDULOS PRINCIPALES<\/p>/g)];
ok(labels.length === 2, `Deben existir exactamente 2 etiquetas MÓDULOS PRINCIPALES (desktop + móvil), hay ${labels.length}`);
ok(!html.includes('<p class="pro-nav-label">MÓDULOS PRINCIPALES</p>\n        <p class="pro-nav-label">MÓDULOS PRINCIPALES</p>'), 'El menú desktop no debe duplicar MÓDULOS PRINCIPALES');

// Navegación móvil simplificada.
ok(!html.includes('class="pro-mobile-bottom-nav"') && !html.includes('bano-bottom-nav'), 'La navegación inferior móvil debe estar eliminada, incluida Baño');
ok(!pro.includes('proMoreBtn'), 'No debe quedar lógica del botón Más de la navegación inferior');
ok(!html.includes('id="proThemeToggle"'), 'El drawer móvil no debe incluir el selector de tema');
ok(!html.includes('id="appShellVersion"'), 'El drawer móvil no debe mostrar la versión');
ok(!html.includes('pro-nav-badge'), 'El drawer móvil no debe mostrar badges de Inventario/Vencimientos');
ok(!shell.includes('app-shell-bottom-nav-height'), 'El shell no debe reservar altura para una navegación inferior eliminada');

// Encabezados tomados de Vencimientos.
for (const eyebrow of ['RESUMEN GENERAL', 'GESTIÓN DEL SISTEMA', 'CONFIGURACIÓN DE USUARIO']) {
  ok(html.includes(`<span class="app-page-eyebrow">${eyebrow}</span>`), `Falta eyebrow ${eyebrow}`);
}
ok(/\.app-reference-heading h1\s*\{[^}]*font-size:\s*28px\s*!important/s.test(unified), 'Los encabezados deben usar la escala canónica de Vencimientos');
ok(/\.app-page-eyebrow[\s\S]*letter-spacing:\s*\.13em/.test(unified), 'El eyebrow debe replicar la referencia de Vencimientos');
ok(html.includes('GESTIÓN DE VENCIMIENTOS</span>\n            <h1>Historial de vencimientos</h1>'), 'Historial debe usar el encabezado canónico de Vencimientos');

// KPI: geometría, diseño y secuencia cromática canónicas.
ok(unified.includes('--app-kpi-height: 116px'), 'La altura canónica de KPI debe ser 116px');
ok(unified.includes('color:var(--app-kpi-accent) !important') || unified.includes('color: var(--app-kpi-accent) !important'), 'Las etiquetas KPI deben usar el color del marco');
ok(unified.includes('--app-kpi-value: #101828') || unified.includes('--app-kpi-value:#101828'), 'El valor principal KPI debe ser negro en tema claro');
for (const screen of ['#pantallaInicio', '#pantallaProductos', '#pantallaVencimientos', '#pantallaTareas', '#pantallaAdmin']) {
  ok(unified.includes(screen), `${screen} debe participar de la unificación de KPI`);
}
const sequence = ['app-kpi-blue', 'app-kpi-red', 'app-kpi-amber', 'app-kpi-green'];
const homeBlock = html.match(/<section class="pro-metrics-grid">([\s\S]*?)<\/section>/)?.[1] || '';
const positionsHome = sequence.map((tone) => homeBlock.indexOf(tone));
ok(positionsHome.every((v) => v >= 0) && positionsHome.every((v, i) => i === 0 || v > positionsHome[i - 1]), 'Inicio debe respetar azul → rojo → amarillo → verde');
for (const id of ['adminTab-inicio', 'adminTab-usuarios', 'adminTab-sectores', 'adminTab-sistema']) {
  const block = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?<section class="admin-kpi-grid[^>]*>([\\s\\S]*?)<\\/section>`))?.[1] || '';
  ok(block, `No se encontró bloque KPI ${id}`);
  const positions = sequence.map((tone) => block.indexOf(tone));
  ok(positions.every((v) => v >= 0) && positions.every((v, i) => i === 0 || v > positions[i - 1]), `${id} debe respetar azul → rojo → amarillo → verde`);
}
ok(app.includes('fila("venc-resumen-7", "app-kpi-blue"') && app.includes('fila("venc-resumen-vencidos", "app-kpi-green"'), 'Vencimientos debe usar la secuencia cromática canónica');
ok(tareas.includes('is-total app-kpi-card app-kpi-blue') && tareas.includes('is-people app-kpi-card app-kpi-green'), 'Tareas Diarias debe usar la secuencia cromática canónica');
ok(unified.includes('.tareas-plan-kpi:nth-child(1)') && unified.includes('.config-kpi:nth-child(4)'), 'Planificación y Configuración de Tareas deben compartir la secuencia KPI canónica');

// Acceso destacado a baño.
ok(html.includes('class="pro-bathroom-banner"') && html.includes('<strong>Limpieza del baño</strong>'), 'Inicio debe incluir el banner destacado de Limpieza del baño');
ok(!html.includes('pro-bathroom-shortcut') && !html.includes('pro-bathroom-shortcut-desktop'), 'No deben quedar accesos pequeños antiguos a Limpieza del baño');
ok(unified.includes('#pantallaInicio .pro-bathroom-banner') && unified.includes('linear-gradient(105deg'), 'Limpieza del baño debe usar el banner rojo de acceso rápido');

// Vencimientos: filtros avanzados retirados, filtros rápidos conservados.
for (const stale of ['btnVencAbrirFiltros', 'vencFiltrosModal', 'btnVencLimpiarFiltros', 'vencFiltroOfertaSelect', 'vencFiltroRubroSelect']) {
  ok(!html.includes(stale), `No debe quedar ${stale} en el HTML`);
  ok(!app.includes(stale), `No debe quedar lógica de ${stale}`);
}
ok(html.includes('id="vencRubrosFiltros"'), 'Los rubros rápidos de Vencimientos deben conservarse');
ok(!app.includes('filtroOfertaVencimientos') && !app.includes('filtroVentanaVencimientos'), 'No deben quedar estados de filtros avanzados eliminados');

// Ofertas resaltadas.
ok(app.includes('d.ofertaActiva ? "is-offer-active"'), 'Las tarjetas con oferta deben marcarse explícitamente');
ok(unified.includes('.venc-product-card.is-offer-active') && unified.includes('border-color: #72d6ac'), 'Las ofertas deben usar marco/fondo verde');

// Historial: sin carga, título canónico, compactación y usuarios centrados.
ok(!html.includes('btnVencCargaDesdeHistorial'), 'Historial no debe mostrar Cargar vencimiento');
ok(!admin.includes('btnVencCargaDesdeHistorial'), 'No debe quedar listener de Cargar vencimiento en Historial');
ok(unified.includes('#vencHistorialAdmin .admin-history-user') && unified.includes('justify-content: center !important'), 'Los responsables deben quedar centrados en escritorio');
ok(unified.includes('.admin-history-toggle') && unified.includes('grid-template-areas:') && unified.includes('\"action product open\"'), 'Historial móvil debe usar tarjetas compactas modernas');
ok(unified.includes('.admin-period-filter') && unified.includes('overflow: visible !important'), 'Los filtros del Historial no deben tener scroll interno');
ok(unified.includes('.admin-history-summary-users') && unified.includes('overflow-x: visible !important'), 'Los usuarios del Historial no deben usar scroll horizontal');

// Historial móvil debajo de los KPIs.
const summaryIndex = html.indexOf('id="vencResumenCard"');
const historyMobileIndex = html.indexOf('id="btnVencHistorialMobile"');
ok(summaryIndex >= 0 && historyMobileIndex > summaryIndex, 'Historial móvil debe aparecer debajo de los contadores');

// Flechas Volver unificadas y sin texto visible.
ok(horarios.includes('horarios-back-topbar admin-header-back-btn') && horarios.includes('<svg viewBox="0 0 24 24"'), 'Horarios debe usar la flecha canónica');
ok(tareas.includes('tareas-back-topbar admin-header-back-btn') && tareas.includes('<svg viewBox="0 0 24 24"'), 'Tareas debe usar la flecha canónica');
ok(!horarios.includes('horarios-back-label">Volver Atrás') && !tareas.includes('tareas-back-label">Volver Atrás'), 'Los botones Volver no deben mostrar texto');

// Logo oficial centrado en el header móvil.
ok(unified.includes('@media (max-width: 900px)') && unified.includes('.pro-topbar::before') && unified.includes('brand-logo-desktop-light.png'), 'El header móvil debe mostrar el logo oficial centrado');
ok(unified.includes('left: 50% !important') && unified.includes('transform: translate(-50%, -50%) !important'), 'El logo móvil debe quedar centrado de forma independiente');
ok(unified.includes('position: sticky !important') && unified.includes('--app-shell-header-height-mobile: 60px'), 'El header móvil debe permanecer en flujo y no tapar contenido');

// FAB sin bottom-nav y signo + centrado.
ok(unified.includes('bottom: calc(16px + env(safe-area-inset-bottom))'), 'Los FAB deben bajar a la esquina inferior derecha');
ok(unified.includes('place-items: center !important') && unified.includes('transform: translateY(-1px)'), 'Los signos + deben quedar centrados ópticamente');

// Configuración: selector moderno real y tipografía móvil reforzada.
for (const id of ['settingsThemeSelect', 'settingsLanguageSelect', 'settingsTextSizeSelect']) {
  ok(html.includes(`data-settings-select="${id}"`), `Falta control moderno para ${id}`);
  ok(html.includes(`id="${id}" class="user-settings-native-select"`), `${id} debe conservar solo el estado nativo oculto`);
}
ok(settings.includes('.user-settings-modern-select') && settings.includes('.user-settings-select-menu'), 'Faltan estilos del selector moderno');
ok(settings.includes('.user-settings-native-select') && settings.includes('display: none !important'), 'El select nativo debe permanecer oculto');
ok(pro.includes('initSettingsModernSelects') && pro.includes('syncSettingsSelectControl'), 'Falta la lógica accesible del selector moderno');
ok(unified.includes('#pantallaAjustes .user-settings-list-row strong') && unified.includes('font-size: 13px !important'), 'Configuración móvil debe mejorar su legibilidad');

ok(!tareas.includes('[data-bano-tab]'), 'No debe quedar lógica de la navegación inferior eliminada de Baño');
ok(!read('tareas-redesign.css').includes('bano-bottom-nav'), 'No deben quedar estilos de la navegación inferior eliminada de Baño');
ok(unified.includes('.horarios-back-topbar,') && unified.includes('display: none !important'), 'Las flechas contextuales deben estar ocultas por defecto para evitar duplicados');

console.log('Correcciones UI finales: OK');
