import { API_BASE_URL } from './config.js?v=71-entrega4-rendimiento-sync';
import { iniciarScanner as iniciarScannerCompartido, detenerScanner as detenerScannerCompartido } from './scanner.js?v=71-entrega4-rendimiento-sync';
import { ordenarPorBusqueda } from './search.js?v=71-entrega4-rendimiento-sync';
import { obtenerJsonCacheado, precargarCatalogo } from './api-cache.js?v=71-entrega4-rendimiento-sync';

const $ = id => document.getElementById(id);
const LAST_KEY = 'autoservicio-precios-ultimo-v2';
let productos = [];
let cargados = false;
let cargando = null;
let scannerActivo = false;
let tabActual = 'consultar';
let cantidadVisible = 100;

function precioNumero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function formatearPrecio(valor) {
  const n = precioNumero(valor);
  if (n === null || n <= 0) return 'Precio no disponible';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n);
}

function normalizarProducto(p) {
  return {
    codigo: String(p?.codigo || '').trim(),
    articulo: String(p?.articulo || 'Producto').trim(),
    precio: precioNumero(p?.precio)
  };
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function cargarProductos({ forzar = false } = {}) {
  if (cargados && !forzar) return productos;
  if (cargando) return cargando;

  cargando = obtenerJsonCacheado('/productos-maestro', { ttl: 5 * 60 * 1000, forzar })
    .then(data => (data.productos || []).map(normalizarProducto))
    .then(lista => {
      productos = lista;
      cargados = true;
      return lista;
    })
    .finally(() => { cargando = null; });

  return cargando;
}

function guardarUltimo(producto) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(producto)); } catch (_) {}
  renderUltimo(producto);
}

function leerUltimo() {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
    return raw ? normalizarProducto(raw) : null;
  } catch (_) {
    return null;
  }
}

function renderUltimo(producto) {
  const box = $('precioUltimoResultado');
  if (!box) return;

  if (!producto || (!producto.codigo && !producto.articulo)) {
    box.className = 'precio-ultimo-vacio';
    box.innerHTML = `
      <span class="precio-empty-icon" aria-hidden="true">🏷️</span>
      <strong>Todavía no consultaste productos</strong>
      <small>Escaneá o buscá un producto para comenzar.</small>`;
    return;
  }

  const disponible = precioNumero(producto.precio) > 0;
  box.className = 'precio-ultimo-producto';
  box.innerHTML = `
    <div class="precio-ultimo-info">
      <strong>${esc(producto.articulo)}</strong>
      <small>Código: ${esc(producto.codigo || 'Sin código')}</small>
    </div>
    <div class="precio-ultimo-divider"></div>
    <div class="precio-ultimo-precio ${disponible ? '' : 'sin-precio'}">
      <span>Precio</span>
      <b>${esc(formatearPrecio(producto.precio))}</b>
    </div>`;
}

function buscar(texto, limite = 5) {
  const consulta = String(texto || '').trim();
  if (consulta.length < 2) return [];
  return ordenarPorBusqueda(productos, consulta, {
    limite,
    campos: ['articulo', 'codigo']
  });
}

function limpiarSugerencias() {
  const cont = $('precioManualSugerencias');
  if (!cont) return;
  cont.innerHTML = '';
  cont.classList.add('oculto');
}

async function renderSugerencias() {
  const cont = $('precioManualSugerencias');
  const input = $('precioManualInput');
  if (!cont || !input) return;

  const consulta = String(input.value || '').trim();
  if (consulta.length < 2) {
    limpiarSugerencias();
    return;
  }

  try { await cargarProductos(); } catch (_) {}
  const lista = buscar(consulta, 5);
  cont.innerHTML = '';

  if (!lista.length) {
    cont.innerHTML = '<div class="manual-no-results">No se encontraron productos.</div>';
    cont.classList.remove('oculto');
    return;
  }

  lista.forEach(producto => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'manual-suggestion-item';
    button.innerHTML = `<strong>${esc(producto.articulo)}</strong><span>${esc(producto.codigo || 'Sin código')}</span>`;
    button.addEventListener('click', () => seleccionar(producto));
    cont.appendChild(button);
  });
  cont.classList.remove('oculto');
}

function cerrarManual() {
  const panel = $('precioManualPanel');
  panel?.classList.add('oculto');
  limpiarSugerencias();
  const input = $('precioManualInput');
  if (input) input.value = '';
  const toggle = $('btnPrecioManualToggle');
  if (toggle) toggle.textContent = 'Ingresar producto manual';
}

function seleccionar(producto) {
  if (!producto) return;
  guardarUltimo(producto);
  detenerScanner();
  cerrarManual();
  cambiarTab('consultar');
}

async function buscarCodigo(codigo) {
  try {
    await cargarProductos();
    const buscado = String(codigo || '').trim();
    const producto = productos.find(item => item.codigo === buscado);
    if (producto) seleccionar(producto);
    else window.dispatchEvent(new CustomEvent('autoservicio-toast', { detail: { texto: 'Producto no encontrado' } }));
  } catch (_) {
    window.dispatchEvent(new CustomEvent('autoservicio-toast', { detail: { texto: 'No se pudieron cargar los productos' } }));
  }
}

async function iniciarScanner() {
  detenerScanner();
  cerrarManual();
  $('preciosActionsCard')?.classList.add('oculto');
  $('precioCameraCard')?.classList.remove('oculto');
  scannerActivo = true;

  try {
    await iniciarScannerCompartido('videoPrecios', codigo => {
      if (!scannerActivo) return;
      buscarCodigo(codigo);
    });
  } catch (error) {
    scannerActivo = false;
    $('precioCameraCard')?.classList.add('oculto');
    $('preciosActionsCard')?.classList.remove('oculto');
    window.dispatchEvent(new CustomEvent('autoservicio-toast', {
      detail: { texto: error?.message || 'No se pudo abrir la cámara' }
    }));
  }
}

function detenerScanner() {
  scannerActivo = false;
  detenerScannerCompartido();
  $('precioCameraCard')?.classList.add('oculto');
  $('preciosActionsCard')?.classList.remove('oculto');
}

function cambiarTab(tab) {
  tabActual = tab;
  if (tab === 'productos') cantidadVisible = 100;
  $('preciosConsultarVista')?.classList.toggle('oculto', tab !== 'consultar');
  $('preciosProductosVista')?.classList.toggle('oculto', tab !== 'productos');
  document.querySelectorAll('[data-precio-tab]').forEach(button => {
    button.classList.toggle('activo', button.dataset.precioTab === tab);
  });
  if (tab === 'productos') {
    detenerScanner();
    renderProductos();
  } else {
    detenerScanner();
  }
}

function renderProductos() {
  const consulta = String($('precioBuscadorProductos')?.value || '').trim();
  const lista = consulta
    ? ordenarPorBusqueda(productos, consulta, { limite: productos.length || 8000, campos: ['articulo', 'codigo'] })
    : productos;

  const cont = $('precioListaProductos');
  const resumen = $('precioResumenProductos');
  if (resumen) resumen.textContent = `${lista.length} productos`;
  if (!cont) return;

  const visibles = lista.slice(0, cantidadVisible);
  cont.innerHTML = visibles.map(producto => {
    const disponible = precioNumero(producto.precio) > 0;
    return `<button type="button" class="precio-product-row" data-precio-codigo="${esc(producto.codigo)}">
      <span><strong>${esc(producto.articulo)}</strong><small>${esc(producto.codigo)}</small></span>
      <b class="${disponible ? '' : 'sin-precio'}">${esc(formatearPrecio(producto.precio))}</b>
    </button>`;
  }).join('') || '<div class="precio-lista-vacia"><strong>No se encontraron productos.</strong></div>';

  if (lista.length > cantidadVisible) {
    cont.insertAdjacentHTML('beforeend', `<button type="button" id="btnPrecioMostrarMas" class="precio-mostrar-mas">Mostrar más (${lista.length - cantidadVisible})</button>`);
  }

  cont.querySelectorAll('[data-precio-codigo]').forEach(button => {
    button.addEventListener('click', () => {
      const producto = productos.find(item => item.codigo === button.dataset.precioCodigo);
      seleccionar(producto);
    });
  });
  $('btnPrecioMostrarMas')?.addEventListener('click', () => {
    cantidadVisible += 100;
    renderProductos();
  });
}

async function activar() {
  renderUltimo(leerUltimo());
  cambiarTab(tabActual);
  try {
    await cargarProductos();
    if (tabActual === 'productos') renderProductos();
  } catch (_) {
    const resumen = $('precioResumenProductos');
    if (resumen) resumen.textContent = 'No se pudieron cargar los productos';
  }
}

function desactivar() {
  detenerScanner();
  cerrarManual();
}

function init() {
  $('btnPrecioAbrirScanner')?.addEventListener('click', iniciarScanner);
  $('btnPrecioCerrarScanner')?.addEventListener('click', detenerScanner);

  $('btnPrecioManualToggle')?.addEventListener('click', async () => {
    detenerScanner();
    await cargarProductos().catch(() => {});
    const panel = $('precioManualPanel');
    const abrir = panel?.classList.contains('oculto');
    panel?.classList.toggle('oculto', !abrir);
    const button = $('btnPrecioManualToggle');
    if (button) button.textContent = abrir ? 'Cancelar ingreso manual' : 'Ingresar producto manual';
    if (abrir) $('precioManualInput')?.focus();
    else cerrarManual();
  });

  $('precioManualInput')?.addEventListener('input', renderSugerencias);
  $('precioManualInput')?.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const resultados = buscar(event.currentTarget.value, 5);
    if (resultados.length === 1) seleccionar(resultados[0]);
    else renderSugerencias();
  });
  $('btnPrecioBuscarManual')?.addEventListener('click', () => {
    const resultados = buscar($('precioManualInput')?.value, 5);
    if (resultados.length === 1) seleccionar(resultados[0]);
    else renderSugerencias();
  });

  $('precioBuscadorProductos')?.addEventListener('input', () => {
    cantidadVisible = 100;
    renderProductos();
  });
  document.querySelectorAll('[data-precio-tab]').forEach(button => {
    button.addEventListener('click', () => cambiarTab(button.dataset.precioTab));
  });
}

init();
window.PreciosModule = { activar, desactivar };
