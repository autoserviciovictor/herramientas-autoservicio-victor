import { API_BASE_URL } from './config.js?v=1960-d21-cierre-etapa6-010926';
import { iniciarScanner, detenerScanner } from './scanner.js?v=1960-d21-cierre-etapa6-010926';
import { ordenarPorBusqueda } from './search.js?v=1960-d21-cierre-etapa6-010926';

const $ = (id) => document.getElementById(id);
const api = (p) => `${String(API_BASE_URL || '').replace(/\/$/, '')}${p}`;

let lotes = [];
let producto = null;
let lotesProducto = [];
let accion = 'nuevo';
let loteReemplazo = '';
let productosMaestro = null;
let buscarTimer = null;
let solicitudProductoActual = 0;
let loteOriginalEdicion = null;
let codigosProvisionales = new Set();
let altaProvisionalNueva = false;
let guardandoLote = false;

function actualizarEncabezadoModal(titulo = 'Cargar producto', descripcion = 'Escaneá un código o buscá el producto manualmente.') {
  const tituloEl = $('lotesModalTitulo');
  const descripcionEl = tituloEl?.parentElement?.querySelector('p');
  if (tituloEl) tituloEl.textContent = titulo;
  if (descripcionEl) descripcionEl.textContent = descripcion;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

async function json(path, opt = {}) {
  const r = await fetch(api(path), {
    ...opt,
    headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.mensaje || 'No se pudo completar la operación');
  return d;
}

function fmt(f) {
  if (!f) return '—';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}


function abrirProgramadorAlerta(lote) {
  return new Promise((resolve) => {
    document.getElementById('lotesNotificarPrompt')?.remove();
    const modal = document.createElement('div');
    modal.id = 'lotesNotificarPrompt';
    modal.className = 'lotes-notify-modal';
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    const minFecha = `${yyyy}-${mm}-${dd}`;
    modal.innerHTML = `
      <div class="lotes-notify-backdrop"></div>
      <section class="lotes-notify-dialog" role="dialog" aria-modal="true" aria-labelledby="lotesNotificarTitulo">
        <div class="lotes-notify-head">
          <div>
            <span class="lotes-notify-eyebrow">RECORDATORIO</span>
            <h3 id="lotesNotificarTitulo">¿Cuándo querés que te avise?</h3>
            <p>Elegí dentro de cuántos días querés recibir la notificación de este lote.</p>
          </div>
          <button type="button" class="lotes-notify-close" aria-label="Cerrar">×</button>
        </div>
        <div class="lotes-notify-lote">
          <span>Vencimiento</span>
          <strong>${fmt(lote?.vencimiento)}</strong>
          <small>${Number(lote?.cantidad) || 0} un.${lote?.cortaFecha ? ' · Corta fecha' : ''}</small>
        </div>
        <div class="lotes-notify-options" role="group" aria-label="Días para el aviso">
          ${[1,3,7,15].map((dias) => `<button type="button" class="lotes-notify-option${dias === 7 ? ' is-selected' : ''}" data-notify-days="${dias}"><strong>${dias}</strong><span>${dias === 1 ? 'día' : 'días'}</span></button>`).join('')}
        </div>
        <button type="button" class="lotes-notify-custom-toggle">📅 Elegir una fecha específica</button>
        <div class="lotes-notify-custom oculto">
          <label for="lotesNotifyFecha">Fecha del aviso</label>
          <input id="lotesNotifyFecha" type="date" min="${minFecha}">
        </div>
        <p class="lotes-notify-error" role="alert" aria-live="polite"></p>
        <div class="lotes-notify-actions">
          <button type="button" class="lotes-notify-modal-cancel">Cancelar</button>
          <button type="button" class="lotes-notify-modal-save">Programar notificación</button>
        </div>
      </section>`;

    let diasSeleccionados = 7;
    let modoFecha = false;
    const terminar = (valor) => { modal.remove(); resolve(valor); };
    const opciones = [...modal.querySelectorAll('[data-notify-days]')];
    const custom = modal.querySelector('.lotes-notify-custom');
    const fecha = modal.querySelector('#lotesNotifyFecha');
    const error = modal.querySelector('.lotes-notify-error');
    const toggle = modal.querySelector('.lotes-notify-custom-toggle');

    opciones.forEach((btn) => btn.addEventListener('click', () => {
      diasSeleccionados = Number(btn.dataset.notifyDays);
      modoFecha = false;
      opciones.forEach((x) => x.classList.toggle('is-selected', x === btn));
      custom.classList.add('oculto');
      toggle.classList.remove('is-selected');
      error.textContent = '';
    }));
    toggle.addEventListener('click', () => {
      modoFecha = true;
      opciones.forEach((x) => x.classList.remove('is-selected'));
      custom.classList.remove('oculto');
      toggle.classList.add('is-selected');
      fecha.focus();
    });
    modal.querySelector('.lotes-notify-modal-save').addEventListener('click', () => {
      if (modoFecha) {
        const valor = String(fecha.value || '').trim();
        if (!valor || valor < minFecha) {
          error.textContent = 'Elegí una fecha válida desde hoy en adelante.';
          fecha.focus();
          return;
        }
        terminar({ fechaAviso: valor });
        return;
      }
      terminar({ dias: diasSeleccionados });
    });
    modal.querySelector('.lotes-notify-backdrop').addEventListener('click', () => terminar(null));
    modal.querySelector('.lotes-notify-close').addEventListener('click', () => terminar(null));
    modal.querySelector('.lotes-notify-modal-cancel').addEventListener('click', () => terminar(null));
    document.body.appendChild(modal);
  });
}

function agruparPorProducto(items) {
  const mapa = new Map();
  for (const x of items) {
    const key = String(x.codigo);
    if (!mapa.has(key)) {
      mapa.set(key, {
        codigo: x.codigo,
        articulo: x.articulo,
        rubro: x.rubro,
        lotes: [],
        cantidadTotal: 0,
        cortaFecha: false
      });
    }
    const p = mapa.get(key);
    p.lotes.push(x);
    p.cantidadTotal += Number(x.cantidad) || 0;
    p.cortaFecha ||= Boolean(x.cortaFecha);
  }
  for (const p of mapa.values()) {
    p.lotes.sort((a, b) => String(a.vencimiento).localeCompare(String(b.vencimiento)));
  }
  return [...mapa.values()];
}

function confirmarAltaProductoNuevo(codigo) {
  return new Promise((resolve) => {
    document.getElementById('lotesProductoNuevoPrompt')?.remove();
    const modal = document.createElement('div');
    modal.id = 'lotesProductoNuevoPrompt';
    modal.className = 'lotes-confirm-delete lotes-new-product-prompt';
    modal.innerHTML = `
      <div class="lotes-confirm-delete-backdrop"></div>
      <section class="lotes-confirm-delete-dialog" role="dialog" aria-modal="true">
        <div class="lotes-confirm-delete-icon" aria-hidden="true">+</div>
        <h3>Producto no encontrado</h3>
        <p>El código <strong>${esc(codigo)}</strong> todavía no está cargado en Productos.</p>
        <div class="lotes-confirm-delete-actions">
          <button type="button" class="lotes-confirm-cancel">Volver al escáner</button>
          <button type="button" class="lotes-confirm-accept">Agregar producto nuevo</button>
        </div>
      </section>`;
    const terminar=(valor)=>{modal.remove();resolve(valor);};
    modal.querySelector('.lotes-confirm-delete-backdrop').onclick=()=>terminar(false);
    modal.querySelector('.lotes-confirm-cancel').onclick=()=>terminar(false);
    modal.querySelector('.lotes-confirm-accept').onclick=()=>terminar(true);
    document.body.appendChild(modal);
  });
}


function pedirCodigoProductoNuevo() {
  return new Promise((resolve) => {
    document.getElementById('lotesCodigoNuevoPrompt')?.remove();
    const modal = document.createElement('div');
    modal.id = 'lotesCodigoNuevoPrompt';
    modal.className = 'lotes-confirm-delete lotes-code-product-prompt';
    modal.innerHTML = `
      <div class="lotes-confirm-delete-backdrop"></div>
      <section class="lotes-confirm-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="lotesCodigoNuevoTitulo">
        <button type="button" class="lotes-confirm-delete-close" aria-label="Cerrar">×</button>
        <div class="lotes-confirm-delete-icon" aria-hidden="true">+</div>
        <h3 id="lotesCodigoNuevoTitulo">Cargar producto</h3>
        <p>Ingresá el código que querés asignarle al producto.</p>
        <div class="lotes-new-code-field">
          <label for="lotesCodigoNuevoInput">Código del producto</label>
          <input id="lotesCodigoNuevoInput" type="text" inputmode="numeric" autocomplete="off" placeholder="Ej.: 200001">
          <small>Puede ser el código de barras o un código interno asignado manualmente.</small>
        </div>
        <div class="lotes-confirm-delete-actions">
          <button type="button" class="lotes-confirm-cancel">Cancelar</button>
          <button type="button" class="lotes-confirm-accept">Continuar</button>
        </div>
      </section>`;

    const terminar = (valor) => {
      modal.remove();
      resolve(valor);
    };
    const input = modal.querySelector('#lotesCodigoNuevoInput');
    const aceptar = () => {
      const codigo = String(input?.value || '').trim();
      if (!codigo) {
        input?.classList.add('is-invalid');
        input?.focus();
        return;
      }
      terminar(codigo);
    };

    modal.querySelector('.lotes-confirm-delete-backdrop').onclick = () => terminar('');
    modal.querySelector('.lotes-confirm-delete-close').onclick = () => terminar('');
    modal.querySelector('.lotes-confirm-cancel').onclick = () => terminar('');
    modal.querySelector('.lotes-confirm-accept').onclick = aceptar;
    input?.addEventListener('input', () => input.classList.remove('is-invalid'));
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') aceptar();
    });
    document.body.appendChild(modal);
    requestAnimationFrame(() => input?.focus());
  });
}

function iniciarAltaProvisionalDirecta() {
  detenerScanner();
  abrirParaProducto();
  prepararAltaProvisional('');
}

function prepararAltaProvisional(codigo = '') {
  const codigoInicial = String(codigo || '').trim();
  altaProvisionalNueva = true;
  producto = { codigo: codigoInicial, articulo: '', provisional: true };
  lotesProducto = [];
  loteOriginalEdicion = null;
  accion = 'nuevo';
  loteReemplazo = '';

  actualizarEncabezadoModal(
    'Cargar producto',
    'Completá los datos del producto recibido. Quedará pendiente hasta que aparezca en el Excel maestro.'
  );
  $('lotesProductoNombre').textContent = 'Nuevo producto';
  $('lotesProductoCodigo').textContent = codigoInicial ? `Código detectado: ${codigoInicial}` : 'Asigná un código al producto';

  $('lotesCodigoCampo')?.classList.remove('oculto');
  if ($('lotesCodigoAlta')) $('lotesCodigoAlta').value = codigoInicial;
  $('lotesDescripcionCampo')?.classList.remove('oculto');
  if ($('lotesDescripcion')) $('lotesDescripcion').value = '';

  $('lotesRubroCampo')?.classList.remove('oculto');
  actualizarRubroVisual('');
  $('lotesFecha').value = '';
  $('lotesCantidad').value = '1';
  $('lotesCorta').checked = false;
  $('lotesExistentes').classList.add('oculto');
  $('lotesForm').classList.remove('oculto');
  modo('producto');

  requestAnimationFrame(() => {
    (codigoInicial ? $('lotesDescripcion') : $('lotesCodigoAlta'))?.focus();
  });
}

function confirmarEliminarLotes({ titulo = 'Eliminar', producto = '', detalle = '', aviso = '' } = {}) {
  return new Promise((resolve) => {
    document.getElementById('lotesConfirmDelete')?.remove();
    const modal = document.createElement('div');
    modal.id = 'lotesConfirmDelete';
    modal.className = 'lotes-confirm-delete';
    // Este modal se abre desde Gestionar lotes: debe quedar siempre por encima
    // del editor principal y de su backdrop, sin importar otros stacking contexts.
    modal.style.setProperty('z-index', '2147483000', 'important');
    modal.innerHTML = `
      <div class="lotes-confirm-delete-backdrop"></div>
      <section class="lotes-confirm-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="lotesConfirmDeleteTitle">
        <button type="button" class="lotes-confirm-delete-close" aria-label="Cerrar">×</button>
        <div class="lotes-confirm-delete-icon" aria-hidden="true">!</div>
        <h3 id="lotesConfirmDeleteTitle">${esc(titulo)}</h3>
        <p>${producto ? `¿Querés eliminar <strong>${esc(producto)}</strong>?` : '¿Querés continuar con la eliminación?'}</p>
        ${detalle ? `<div class="lotes-confirm-delete-detail">${esc(detalle)}</div>` : ''}
        ${aviso ? `<div class="lotes-confirm-delete-info">${esc(aviso)}</div>` : ''}
        <div class="lotes-confirm-delete-actions">
          <button type="button" class="lotes-confirm-cancel">Cancelar</button>
          <button type="button" class="lotes-confirm-accept">Eliminar</button>
        </div>
      </section>`;
    const terminar = (valor) => {
      document.removeEventListener('keydown', teclado);
      modal.remove();
      resolve(valor);
    };
    const teclado = (e) => { if (e.key === 'Escape') terminar(false); };
    const confirmBackdrop = modal.querySelector('.lotes-confirm-delete-backdrop');
    const confirmDialog = modal.querySelector('.lotes-confirm-delete-dialog');
    confirmBackdrop?.style.setProperty('z-index', '0', 'important');
    confirmDialog?.style.setProperty('z-index', '1', 'important');
    confirmBackdrop.onclick = () => terminar(false);
    modal.querySelector('.lotes-confirm-delete-close').onclick = () => terminar(false);
    modal.querySelector('.lotes-confirm-cancel').onclick = () => terminar(false);
    modal.querySelector('.lotes-confirm-accept').onclick = () => terminar(true);
    document.addEventListener('keydown', teclado);
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.querySelector('.lotes-confirm-cancel')?.focus());
  });
}

function confirmarEliminarProductoLotes(p) {
  const n = Number(p?.lotes?.length || 0);
  return confirmarEliminarLotes({
    titulo: 'Eliminar producto',
    producto: p.articulo,
    aviso: `Se eliminarán ${n} lote${n === 1 ? '' : 's'} de Control de Lotes. Los registros de Vencimientos permanecerán sin cambios.`
  });
}

function confirmarEliminarLoteIndividual(lote) {
  return confirmarEliminarLotes({
    titulo: 'Eliminar lote',
    producto: producto?.articulo || lote?.articulo || '',
    detalle: `Vencimiento: ${fmt(lote?.vencimiento)} · Cantidad: ${Number(lote?.cantidad || 0)} un.`,
    aviso: lote?.cortaFecha
      ? 'Este lote está marcado como Corta fecha. Su registro en Vencimientos permanecerá sin cambios.'
      : 'Se eliminará solamente este lote de Control de Lotes.'
  });
}

function diasHastaVencimientoLote(fecha) {
  if (!fecha) return 99999;
  // Misma regla usada por Vencimientos para que ambos módulos clasifiquen igual.
  const ahora = new Date();
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const vence = new Date(String(fecha) + 'T00:00:00');
  if (Number.isNaN(vence.getTime())) return 99999;
  return Math.ceil((vence - hoy) / 86400000);
}

function bucketVencimientoLote(lote) {
  const fecha = String(lote?.vencimiento || '').trim();
  if (!fecha) return 'fuera';
  const dias = diasHastaVencimientoLote(fecha);
  if (dias === 99999) return 'fuera';
  if (dias <= 0) return 'vencidos';
  if (dias <= 7) return '7';
  if (dias <= 15) return '15';
  return '16mas';
}

const lotesGruposAbiertos = new Set(['7', '15', '16mas', 'vencidos']);

function render() {
  const q = ($('lotesBuscar')?.value || '').toLowerCase().trim();
  const rubro = document.querySelector('[data-lotes-rubro].activo')?.dataset.lotesRubro || 'todos';

  const productos = agruparPorProducto(lotes);
  const productosConBucket = productos.map((p) => ({
    ...p,
    bucketVencimiento: bucketVencimientoLote(p.lotes[0])
  }));
  const filtrados = productosConBucket.filter((p) =>
    (rubro === 'todos' || p.rubro === rubro) &&
    (!q || `${p.articulo} ${p.codigo}`.toLowerCase().includes(q))
  );

  const resumenVencimientos = productosConBucket.reduce((resumen, p) => {
    if (p.bucketVencimiento in resumen) resumen[p.bucketVencimiento] += 1;
    return resumen;
  }, { '7': 0, '15': 0, '16mas': 0, vencidos: 0 });

  $('lotesMetrica7Dias').textContent = resumenVencimientos['7'];
  $('lotesMetrica15Dias').textContent = resumenVencimientos['15'];
  $('lotesMetrica16Mas').textContent = resumenVencimientos['16mas'];
  $('lotesMetricaVencidos').textContent = resumenVencimientos.vencidos;

  const grupos = [
    ['7', 'PRÓXIMOS 7 DÍAS', 'Vencen entre hoy y 7 días'],
    ['15', '8 A 15 DÍAS', 'Vencen entre 8 y 15 días'],
    ['16mas', '16 DÍAS EN ADELANTE', 'Vencen dentro de 16 días o más'],
    ['vencidos', 'VENCIDOS', 'Productos con fecha de vencimiento pasada']
  ];

  const cardProducto = (p) => {
    const proximo = p.lotes[0];
    const plural = p.lotes.length === 1 ? 'lote' : 'lotes';
    return `<article class="lote-card lote-product-card ${p.cortaFecha ? 'is-short' : ''}" data-lote-producto="${esc(p.codigo)}" tabindex="0" role="button" aria-label="Ver lotes de ${esc(p.articulo)}">
      <div class="lote-card-top"><span class="lote-rubro">${esc(p.rubro)}</span>${codigosProvisionales.has(String(p.codigo)) ? '<span class="lote-pending">Producto pendiente</span>' : ''}${p.cortaFecha ? '<span class="lote-short">Corta fecha</span>' : ''}</div>
      <h3>${esc(p.articulo)}</h3><small>EAN ${esc(p.codigo)}</small>
      <div class="lote-card-data"><div><span>Lotes</span><b>${p.lotes.length} ${plural}</b></div><div><span>Stock total</span><b>${p.cantidadTotal} un.</b></div></div>
      <div class="lote-card-footer"><div class="lote-card-next"><span>Próximo vencimiento</span><b>${fmt(proximo?.vencimiento)}</b></div><button class="lote-card-delete" type="button" data-eliminar-producto="${esc(p.codigo)}" aria-label="Eliminar ${esc(p.articulo)}">Eliminar</button></div>
    </article>`;
  };

  const html = grupos.map(([bucket, titulo, detalle]) => {
    const items = filtrados.filter((p) => p.bucketVencimiento === bucket);
    const abierto = lotesGruposAbiertos.has(bucket);
    const icono = bucket === 'vencidos' ? 'icon-box' : 'icon-calendar';
    return `<section class="lotes-venc-grupo lotes-venc-grupo--${bucket} ${abierto ? 'is-open' : 'is-closed'}" id="lotesGrupo-${bucket}" data-lotes-grupo="${bucket}">
      <button class="lotes-venc-grupo-head" type="button" data-lotes-toggle-grupo="${bucket}" aria-expanded="${abierto}" aria-controls="lotesGrupoContenido-${bucket}">
        <span class="lotes-venc-grupo-icon" aria-hidden="true"><svg class="app-icon"><use href="#${icono}"></use></svg></span>
        <span class="lotes-venc-grupo-copy"><strong>${titulo}</strong><span>${detalle}</span></span>
        <span class="lotes-venc-grupo-meta"><b>${items.length} producto${items.length === 1 ? '' : 's'}</b><i aria-hidden="true"><svg class="app-icon"><use href="#icon-chevron-down"></use></svg></i></span>
      </button>
      <div class="lotes-venc-grupo-grid" id="lotesGrupoContenido-${bucket}" ${abierto ? '' : 'hidden'}>${items.length ? items.map(cardProducto).join('') : '<div class="lotes-venc-grupo-empty">No hay productos en este grupo.</div>'}</div>
    </section>`;
  }).join('');

  $('lotesLista').innerHTML = html;

  document.querySelectorAll('[data-lotes-toggle-grupo]').forEach((head) => {
    head.addEventListener('click', () => {
      const bucket = head.dataset.lotesToggleGrupo;
      if (lotesGruposAbiertos.has(bucket)) lotesGruposAbiertos.delete(bucket);
      else lotesGruposAbiertos.add(bucket);
      render();
    });
  });

  document.querySelectorAll('[data-lote-producto]').forEach((card) => {
    const abrirProducto = () => seleccionarCodigo(card.dataset.loteProducto);
    card.addEventListener('click', abrirProducto);
    card.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); abrirProducto(); } });
  });
  document.querySelectorAll('[data-eliminar-producto]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const codigo = btn.dataset.eliminarProducto;
      const p = productos.find((x) => String(x.codigo) === String(codigo));
      if (!p) return;
      const confirmar = await confirmarEliminarProductoLotes(p); if (!confirmar) return;
      try { btn.disabled = true; await json(`/lotes/producto/${encodeURIComponent(codigo)}`, { method: 'DELETE' }); await cargar(); }
      catch (error) { mostrarAvisoLotes(error.message); btn.disabled = false; }
    });
  });
}

async function cargar() {
  try {
    const d = await json('/lotes');
    lotes = d.lotes || [];
    codigosProvisionales = new Set((d.provisionales || []).map(String));
    render();
  } catch (e) {
    $('lotesLista').innerHTML = `<div class="lotes-empty">${esc(e.message)}</div>`;
  }
}

function modo(m) {
  const inicio = $('lotesInicio');
  const camara = $('lotesCamara');
  const manual = $('lotesManual');
  const productoCard = $('lotesProducto');
  const hero = $('lotesHero');
  const divider = $('lotesDivider');
  const manualToggle = $('btnLotesManual');
  const manualCamara = $('btnLotesManualCamara');
  const nuevoProductoCamara = $('btnLotesNuevoProductoCamara');

  inicio?.classList.toggle('oculto', m === 'camara' || m === 'producto');
  camara?.classList.toggle('oculto', m !== 'camara');
  manual?.classList.toggle('oculto', m !== 'manual');
  productoCard?.classList.toggle('oculto', m !== 'producto');
  hero?.classList.toggle('oculto', m === 'manual');
  divider?.classList.toggle('oculto', m === 'manual');
  manualToggle?.classList.toggle('oculto', m === 'manual');
  manualCamara?.classList.toggle('oculto', m !== 'camara');
  nuevoProductoCamara?.classList.toggle('oculto', m !== 'camara');

  if (m === 'manual') {
    const inputManual = $('lotesManualInput');
    if (inputManual) inputManual.value = '';
    $('lotesSugerencias')?.classList.add('oculto');
    if ($('lotesSugerencias')) $('lotesSugerencias').innerHTML = '';
    requestAnimationFrame(() => inputManual?.focus());
  }
}

async function abrir() {
  actualizarEncabezadoModal();
  producto = null;
  lotesProducto = [];
  altaProvisionalNueva = false;
  $('lotesCodigoCampo')?.classList.add('oculto');
  $('lotesDescripcionCampo')?.classList.add('oculto');
  if ($('lotesCodigoAlta')) $('lotesCodigoAlta').value = '';
  if ($('lotesManualInput')) $('lotesManualInput').value = '';
  if ($('lotesSugerencias')) {
    $('lotesSugerencias').innerHTML = '';
    $('lotesSugerencias').classList.add('oculto');
  }
  accion = 'nuevo';
  loteReemplazo = '';
  $('lotesModal').classList.remove('oculto');
  $('lotesModal').setAttribute('aria-hidden', 'false');
  document.body.classList.add('lotes-modal-open');
  modo('inicio');
  requestAnimationFrame(() => requestAnimationFrame(() => escanear()));
}

function abrirParaProducto() {
  $('lotesModal').classList.remove('oculto');
  $('lotesModal').setAttribute('aria-hidden', 'false');
  document.body.classList.add('lotes-modal-open');
}

function cerrar() {
  solicitudProductoActual += 1;
  detenerScanner();
  $('lotesModal').classList.add('oculto');
  $('lotesModal').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lotes-modal-open');
}

async function escanear() {
  modo('camara');
  try {
    await iniciarScanner('videoLotes', seleccionarCodigo);
  } catch (e) {
    modo('inicio');
    $('lotesCameraError').textContent =
      'No se pudo iniciar la cámara. Revisá los permisos del navegador o usá el ingreso manual.';
    $('lotesCameraError').classList.remove('oculto');
  }
}

async function seleccionarCodigo(codigo) {
  detenerScanner();
  const solicitud = ++solicitudProductoActual;
  abrirParaProducto();

  // Limpiar inmediatamente cualquier producto anterior.
  producto = null;
  lotesProducto = [];
  loteOriginalEdicion = null;
  accion = 'nuevo';
  loteReemplazo = '';
  actualizarEncabezadoModal('Cargando producto…', 'Estamos preparando la información del producto.');
  $('lotesProductoNombre').textContent = 'Cargando…';
  $('lotesProductoCodigo').textContent = '';
  $('lotesExistentes').innerHTML = '';
  $('lotesExistentes').classList.add('oculto');
  $('lotesForm').classList.add('oculto');
  modo('producto');

  try {
    const d = await json(`/lotes/producto-resuelto/${encodeURIComponent(codigo)}`);
    if (solicitud !== solicitudProductoActual) return;
    await preparar(d.producto, solicitud);
  } catch (e) {
    if (solicitud !== solicitudProductoActual) return;

    // El estado "Cargando producto…" no debe quedar por encima del aviso.
    $('lotesModal').classList.add('oculto');
    $('lotesModal').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lotes-modal-open');

    const agregar = await confirmarAltaProductoNuevo(codigo);
    if (solicitud !== solicitudProductoActual) return;

    if (agregar) {
      abrirParaProducto();
      prepararAltaProvisional(codigo);
    } else {
      await abrir();
    }
  }
}
function limpiarSeleccionLotes() {
  document.querySelectorAll('.lote-existing').forEach((el) => el.classList.remove('is-selected'));
}

function mostrarModoEdicion(tipo, id = '') {
  accion = tipo;
  loteReemplazo = id;
  const existentes = $('lotesExistentes');
  const form = $('lotesForm');

  limpiarSeleccionLotes();

  if (tipo === 'reemplazar' || tipo === 'editar') {
    existentes?.classList.remove('oculto');
    const seleccionado = existentes?.querySelector(`[data-lote-row="${CSS.escape(String(id))}"]`);
    seleccionado?.classList.add('is-selected');
    form?.classList.remove('oculto');
    seleccionado?.scrollIntoView({ block: 'nearest' });
    return;
  }

  if (tipo === 'agregar') {
    existentes?.classList.add('oculto');
    form?.classList.remove('oculto');
  }
}
async function preparar(p, solicitud = solicitudProductoActual) {
  const [d, alertasData] = await Promise.all([json(`/lotes/producto/${encodeURIComponent(p.codigo)}`), json(`/lotes/alertas/${encodeURIComponent(p.codigo)}`).catch(() => ({ alertas: [] }))]);
  if (solicitud !== solicitudProductoActual) return;

  producto = p;
  altaProvisionalNueva = false;
  $('lotesCodigoCampo')?.classList.add('oculto');
  $('lotesDescripcionCampo')?.classList.add('oculto');
  if ($('lotesCodigoAlta')) $('lotesCodigoAlta').value = '';
  lotesProducto = d.lotes || [];
  const alertasPorLote = new Map((alertasData.alertas || []).map((a) => [String(a.loteId), a]));
  loteOriginalEdicion = null;

  $('lotesProductoNombre').textContent = p.articulo;
  $('lotesProductoCodigo').textContent = `Código: ${p.codigo}`;

  const rubroExistente = lotesProducto[0]?.rubro || '';
  $('lotesRubroCampo').classList.toggle('oculto', Boolean(rubroExistente));
  actualizarRubroVisual(rubroExistente || '');
  $('lotesFecha').value = '';
  $('lotesCantidad').value = '1';
  $('lotesCorta').checked = false;

  if (lotesProducto.length) {
    actualizarEncabezadoModal('Gestionar lotes', 'Revisá los lotes cargados, editá uno, reemplazalo o agregá un lote nuevo.');
    accion = 'agregar';
    loteReemplazo = '';

    $('lotesExistentes').classList.remove('oculto');
    $('lotesExistentes').innerHTML = `
      <strong class="lotes-existing-title">Lotes cargados</strong>
      ${lotesProducto.map((x) => `
        <div class="lote-existing" data-lote-row="${esc(x.id)}">
          <span><b>${fmt(x.vencimiento)}</b><small>${x.cantidad} un.${x.cortaFecha ? ' · Corta fecha' : ''}</small></span>
          <div class="lote-existing-actions">
            <button type="button" class="lote-edit-btn" data-editar-lote="${esc(x.id)}">Editar</button>
            <button type="button" data-reemplazar-lote="${esc(x.id)}">Reemplazar</button>
            <button type="button" class="lote-delete-one-btn" data-eliminar-lote="${esc(x.id)}">Eliminar</button>
          </div>
          <div class="lote-notify-row">
            ${alertasPorLote.has(String(x.id))
              ? `<span class="lote-notify-active">🔔 Aviso: ${fmt(alertasPorLote.get(String(x.id)).fechaAviso)}</span><button type="button" class="lote-notify-cancel" data-cancelar-alerta="${esc(x.id)}">Cancelar aviso</button>`
              : `<button type="button" class="lote-notify-btn" data-programar-alerta="${esc(x.id)}">🔔 Notificarme</button>`}
          </div>
        </div>`).join('')}
      <button class="lote-add-new" type="button" id="lotesAgregarNuevo">+ Agregar lote nuevo</button>`;

    $('lotesForm').classList.add('oculto');

    const cargarLoteEnFormulario = (id, tipo) => {
      const lote = lotesProducto.find((x) => String(x.id) === String(id));
      if (!lote) return;
      loteOriginalEdicion = { ...lote };
      $('lotesFecha').value = lote.vencimiento || '';
      $('lotesCantidad').value = String(lote.cantidad || 1);
      $('lotesCorta').checked = Boolean(lote.cortaFecha);
      mostrarModoEdicion(tipo, id);
    };

    document.querySelectorAll('[data-editar-lote]').forEach((b) => {
      b.onclick = () => cargarLoteEnFormulario(b.dataset.editarLote, 'editar');
    });
    document.querySelectorAll('[data-reemplazar-lote]').forEach((b) => {
      b.onclick = () => cargarLoteEnFormulario(b.dataset.reemplazarLote, 'reemplazar');
    });

    document.querySelectorAll('[data-programar-alerta]').forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.programarAlerta;
        const lote = lotesProducto.find((x) => String(x.id) === String(id));
        if (!lote) return;
        const payload = await abrirProgramadorAlerta(lote);
        if (!payload) return;
        try {
          b.disabled = true;
          await json(`/lotes/${encodeURIComponent(id)}/alerta`, { method: 'POST', body: JSON.stringify(payload) });
          await preparar(producto, solicitudProductoActual);
        } catch (error) {
          mostrarAvisoLotes(error.message);
          b.disabled = false;
        }
      };
    });
    document.querySelectorAll('[data-cancelar-alerta]').forEach((b) => {
      b.onclick = async () => {
        try{ b.disabled=true; await json(`/lotes/${encodeURIComponent(b.dataset.cancelarAlerta)}/alerta`,{method:'DELETE'}); await preparar(producto,solicitudProductoActual); }
        catch(error){mostrarAvisoLotes(error.message);b.disabled=false;}
      };
    });

    document.querySelectorAll('[data-eliminar-lote]').forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.eliminarLote;
        const lote = lotesProducto.find((x) => String(x.id) === String(id));
        if (!lote) return;
        if (!(await confirmarEliminarLoteIndividual(lote))) return;

        try {
          b.disabled = true;
          await json(`/lotes/${encodeURIComponent(id)}`, { method: 'DELETE' });
          await cargar();

          const restantes = lotesProducto.filter((x) => String(x.id) !== String(id));
          if (!restantes.length) {
            cerrar();
            return;
          }
          await preparar(producto, solicitudProductoActual);
        } catch (error) {
          mostrarAvisoLotes(error.message);
          b.disabled = false;
        }
      };
    });

    $('lotesAgregarNuevo').onclick = () => {
      loteOriginalEdicion = null;
      $('lotesFecha').value = '';
      $('lotesCantidad').value = '1';
      $('lotesCorta').checked = false;
      mostrarModoEdicion('agregar');
    };
  } else {
    actualizarEncabezadoModal('Cargar producto', 'Completá los datos para registrar el primer lote de este producto.');
    $('lotesExistentes').classList.add('oculto');
    $('lotesForm').classList.remove('oculto');
    accion = 'nuevo';
    loteReemplazo = '';
  }

  modo('producto');
}
async function obtenerProductosMaestro() {
  if (productosMaestro) return productosMaestro;
  const d = await json('/lotes/productos-busqueda');
  productosMaestro = d.productos || [];
  return productosMaestro;
}

function pintarSugerencias(items, q) {
  const box = $('lotesSugerencias');
  if (!box) return;

  if (!q) {
    box.innerHTML = '';
    box.classList.add('oculto');
    return;
  }

  box.innerHTML = items.length
    ? items.map((p) => `<button class="manual-suggestion-item" type="button" data-codigo="${esc(p.codigo)}">
        <strong>${esc(p.articulo)}</strong>
        <span>${esc(p.codigo)}${p.provisional ? ' · Producto pendiente' : ''}</span>
      </button>`).join('')
    : '<div class="manual-no-results">No se encontraron productos.</div>';

  box.classList.remove('oculto');
  box.querySelectorAll('[data-codigo]').forEach((b) => {
    b.onclick = () => {
      if ($('lotesManualInput')) $('lotesManualInput').value = b.dataset.codigo;
      pintarSugerencias([], '');
      seleccionarCodigo(b.dataset.codigo);
    };
  });
}

async function buscarManual() {
  const q = ($('lotesManualInput')?.value || '').trim();
  if (q.length < 2) {
    pintarSugerencias([], '');
    return;
  }

  try {
    const productos = await obtenerProductosMaestro();
    // Misma lógica del buscador de Vencimientos: tolera palabras en distinto
    // orden, coincidencias parciales, acentos y errores breves.
    const items = ordenarPorBusqueda(productos, q, {
      limite: 5,
      campos: ['articulo', 'codigo']
    });
    pintarSugerencias(items, q);
  } catch (e) {
    mostrarAvisoLotes(e.message);
  }
}

async function buscarVencimientoVinculado(codigo, fecha) {
  const d = await json('/vencimientos');
  return (d.vencimientos || []).find((x) =>
    String(x.codigo) === String(codigo) && String(x.vencimiento) === String(fecha)
  ) || null;
}

async function sincronizarVencimientoDesdeLote({ anterior = null, nuevo, rubro }) {
  const codigo = nuevo.codigo;
  const estaba = Boolean(anterior?.cortaFecha);
  const queda = Boolean(nuevo.cortaFecha);
  const fechaAnterior = anterior?.vencimiento || nuevo.vencimiento;
  let registro = estaba ? await buscarVencimientoVinculado(codigo, fechaAnterior) : null;

  if (!queda) {
    if (estaba && registro) {
      await json(`/vencimientos/${encodeURIComponent(registro.id)}`, { method: 'DELETE' });
    }
    return;
  }

  if (!registro) registro = await buscarVencimientoVinculado(codigo, nuevo.vencimiento);

  const body = {
    codigo,
    articulo: nuevo.articulo,
    vencimiento: nuevo.vencimiento,
    salon: nuevo.cantidad,
    deposito: 0,
    cantidad: nuevo.cantidad,
    oferta: false,
    rubro
  };

  if (registro) {
    await json(`/vencimientos/${encodeURIComponent(registro.id)}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  } else {
    await json('/vencimientos', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }
}

async function guardar() {
  // Bloqueo sincrónico: evita doble click/tap y dos handlers concurrentes.
  if (guardandoLote || !producto) return;
  guardandoLote = true;
  const botonGuardar = $('btnLotesGuardar');
  if (botonGuardar) botonGuardar.disabled = true;

  try {

  const vencimiento = $('lotesFecha').value;
  const cantidad = Number($('lotesCantidad').value);
  const rubro = $('lotesRubro').value || lotesProducto[0]?.rubro;
  const cortaFecha = $('lotesCorta').checked;

  if (!vencimiento || !Number.isInteger(cantidad) || cantidad <= 0) {
    return mostrarAvisoLotes('Completá fecha de vencimiento y una cantidad válida.');
  }
  if (!rubro) return mostrarAvisoLotes('Seleccioná Fiambrería o Lácteos.');

  if (altaProvisionalNueva) {
    const codigoAlta = ($('lotesCodigoAlta')?.value || '').trim();
    const descripcion = ($('lotesDescripcion')?.value || '').trim();
    if (!codigoAlta) return mostrarAvisoLotes('Ingresá el código del producto.');
    if (!descripcion) return mostrarAvisoLotes('Ingresá el nombre del producto.');

    producto.codigo = codigoAlta;
    try {
      const alta = await json('/lotes/productos-provisionales', {
        method: 'POST',
        body: JSON.stringify({ codigo: codigoAlta, articulo: descripcion, rubro })
      });
      producto = alta.producto;
      productosMaestro = null;
      altaProvisionalNueva = false;
    } catch (e) {
      return mostrarAvisoLotes(e.message);
    }
  }

  const body = {
    codigo: producto.codigo,
    articulo: producto.articulo,
    rubro,
    vencimiento,
    cantidad,
    // Se sincroniza Vencimientos por sus endpoints normales para que quede historial.
    cortaFecha: false
  };

  try {
    let loteGuardado;

    if (accion === 'reemplazar' || accion === 'editar') {
      const d = await json(`/lotes/${encodeURIComponent(loteReemplazo)}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      loteGuardado = d.lote;
    } else {
      const d = await json('/lotes', { method: 'POST', body: JSON.stringify(body) });
      loteGuardado = d.lote;
    }

    await sincronizarVencimientoDesdeLote({
      anterior: loteOriginalEdicion,
      nuevo: { ...loteGuardado, cortaFecha },
      rubro
    });

    // Guardar el estado Corta fecha en el lote. Si el vencimiento ya existe,
    // el servidor ignora correctamente el duplicado.
    if (cortaFecha) {
      await json(`/lotes/${encodeURIComponent(loteGuardado.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ ...body, cortaFecha: true })
      });
    }

    await cargar();
    cerrar();
    producto = null;
    lotesProducto = [];
    loteOriginalEdicion = null;
    accion = 'nuevo';
    loteReemplazo = '';
  } catch (e) {
    mostrarAvisoLotes(e.message);
  }
  } finally {
    guardandoLote = false;
    if (botonGuardar) botonGuardar.disabled = false;
  }
}
function inyectarAjustesVisuales() {
  if (document.getElementById('lotesCorreccionesUx')) return;
  const style = document.createElement('style');
  style.id = 'lotesCorreccionesUx';
  style.textContent = `
    /* Control de Lotes: tipografía nítida y dimensiones equivalentes a los cargadores existentes */
    #lotesModal, #lotesModal * {
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    #lotesModal .lotes-dialog {
      width: min(620px, calc(100vw - 32px)) !important;
      max-height: 90vh;
    }
    #lotesModal .lotes-modal-head { padding: 20px 24px 16px !important; }
    #lotesModal .lotes-modal-head span { font-size: 11px !important; }
    #lotesModal .lotes-modal-head h2 { font-size: 21px !important; line-height: 1.2; }
    #lotesModal .lotes-modal-head p { font-size: 13px !important; line-height: 1.4; }
    #lotesModal .lotes-mode { padding: 18px 24px 22px !important; }
    #lotesModal .lotes-product-box h3 { font-size: 16px !important; line-height: 1.3; }
    #lotesModal .lotes-product-box p,
    #lotesModal .lote-existing small { font-size: 12px !important; }
    #lotesModal .lotes-form label { font-size: 13px !important; line-height: 1.3; }
    #lotesModal .lotes-form input,
    #lotesModal .lotes-form select {
      min-height: 44px;
      font: inherit !important;
      font-size: 14px !important;
      line-height: 1.2 !important;
      background-color: #fff;
    }

    /* Select visual propio: se elimina la flecha/estilo nativo */
    #lotesModal .lotes-form select {
      appearance: none !important;
      -webkit-appearance: none !important;
      padding-right: 42px !important;
      background-image:
        linear-gradient(45deg, transparent 50%, #667085 50%),
        linear-gradient(135deg, #667085 50%, transparent 50%) !important;
      background-position:
        calc(100% - 18px) 50%,
        calc(100% - 13px) 50% !important;
      background-size: 5px 5px, 5px 5px !important;
      background-repeat: no-repeat !important;
      cursor: pointer;
    }

    /* Lote seleccionado para reemplazo */
    #lotesModal .lote-existing {
      border: 1px solid transparent;
      border-bottom-color: #edf0f4;
      border-radius: 10px;
      padding: 10px 9px;
      transition: background .15s ease, border-color .15s ease, box-shadow .15s ease;
    }
    #lotesModal .lote-existing.is-selected {
      border-color: #f32646 !important;
      background: #fff4f6 !important;
      box-shadow: 0 0 0 2px rgba(243,38,70,.08);
    }
    #lotesModal .lote-existing.is-selected [data-reemplazar-lote] {
      background: #f32646;
      color: #fff;
    }

    /* Resultado manual con tamaño legible */
    #lotesModal .lotes-suggestions .manual-suggestion-item {
      min-height: 58px;
      padding: 10px 12px !important;
      border: 1px solid #e1e7ef !important;
      border-radius: 10px;
      margin-bottom: 6px;
      background: #f8fafc !important;
    }
    #lotesModal .manual-suggestion-item strong {
      display: block;
      font-size: 13px !important;
      line-height: 1.3;
      color: #101828;
    }
    #lotesModal .manual-suggestion-item span {
      display: block;
      margin-top: 3px;
      font-size: 11px !important;
      color: #667085;
    }

    /* Una tarjeta por producto */
    .lote-product-card { cursor: pointer; }
    .lote-product-card:hover {
      border-color: #cbd5e1;
      box-shadow: 0 5px 16px rgba(15,23,42,.06);
    }
    .lote-card-footer {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
      border-top: 1px solid #edf0f4;
      margin-top: 10px;
      padding-top: 9px;
    }
    .lote-card-next {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .lote-card-next > span { font-size: 10px; color: #7b8797; }
    .lote-card-next > b { font-size: 12px; color: #101828; }
    .lote-card-delete {
      border: 1px solid #f32646;
      background: #fff;
      color: #f32646;
      border-radius: 8px;
      padding: 7px 11px;
      font: inherit;
      font-size: 11px;
      font-weight: 750;
      cursor: pointer;
    }
    .lote-card-delete:hover { background: #fff2f4; }

    .lotes-confirm-delete {
      position: fixed;
      inset: 0;
      z-index: 10050;
      display: grid;
      place-items: center;
      padding: 20px;
    }
    .lotes-confirm-delete-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(16, 24, 40, .46);
      backdrop-filter: blur(2px);
    }
    .lotes-confirm-delete-dialog {
      position: relative;
      width: min(420px, calc(100vw - 32px));
      border-radius: 18px;
      background: #fff;
      box-shadow: 0 24px 70px rgba(16, 24, 40, .24);
      padding: 28px;
      text-align: center;
      animation: lotesConfirmIn .16s ease-out;
    }
    .lotes-confirm-delete-close {
      position: absolute;
      top: 13px;
      right: 14px;
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 9px;
      background: #f5f7fa;
      color: #667085;
      font: inherit;
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
    }
    .lotes-confirm-delete-icon {
      display: grid;
      place-items: center;
      width: 50px;
      height: 50px;
      margin: 0 auto 15px;
      border-radius: 50%;
      background: #fff0f2;
      color: #f32646;
      font-size: 25px;
      font-weight: 850;
    }
    .lotes-confirm-delete-dialog h3 {
      margin: 0 0 9px;
      color: #101828;
      font-size: 19px;
      font-weight: 800;
    }
    .lotes-confirm-delete-dialog p {
      margin: 0;
      color: #475467;
      font-size: 13px;
      line-height: 1.55;
    }
    .lotes-confirm-delete-dialog p strong { color: #101828; }
    .lotes-confirm-delete-info {
      margin-top: 16px;
      padding: 11px 13px;
      border-radius: 10px;
      background: #fff7f8;
      color: #b4233a;
      font-size: 12px;
      line-height: 1.45;
    }
    .lotes-confirm-delete-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 22px;
    }
    .lotes-confirm-delete-actions button {
      min-height: 42px;
      border-radius: 10px;
      font: inherit;
      font-size: 13px;
      font-weight: 750;
      cursor: pointer;
    }
    .lotes-confirm-cancel {
      border: 1px solid #d7dee8;
      background: #fff;
      color: #344054;
    }
    .lotes-confirm-accept {
      border: 1px solid #f32646;
      background: #f32646;
      color: #fff;
    }
    @keyframes lotesConfirmIn {
      from { opacity: 0; transform: translateY(6px) scale(.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (max-width: 520px) {
      .lotes-confirm-delete-dialog { padding: 25px 20px 20px; }
      .lotes-confirm-delete-actions { grid-template-columns: 1fr; }
      .lotes-confirm-accept { order: -1; }
    }

    .lote-existing-actions { display: flex; gap: 7px; align-items: center; }
    #lotesModal .lote-delete-one-btn {
      border: 1px solid #f32646 !important;
      color: #f32646 !important;
      background: #fff !important;
    }
    #lotesModal .lote-delete-one-btn:hover { background: #fff2f4 !important; }
    .lotes-confirm-delete-detail {
      margin-top: 14px;
      padding: 10px 12px;
      border: 1px solid #e4e7ec;
      border-radius: 10px;
      background: #f8fafc;
      color: #344054;
      font-size: 12px;
      font-weight: 700;
    }
    #lotesModal .lote-edit-btn {
      border-color: #d7dee8 !important;
      color: #344054 !important;
      background: #fff !important;
    }

    @media (max-width:700px) {
      #lotesModal .lotes-dialog {
        width: 100% !important;
        max-height: 88vh;
      }
      #lotesModal .lotes-modal-head { padding: 17px 18px 14px !important; }
      #lotesModal .lotes-mode { padding: 15px 18px 20px !important; }
    }
  `;
  document.head.appendChild(style);
}


function mostrarAvisoLotes(mensaje, titulo = '', alCerrar = null) {
  document.getElementById('lotesNotice')?.remove();
  const modal = document.createElement('div');
  modal.id = 'lotesNotice';
  modal.className = 'lotes-notice';
  modal.innerHTML = `
    <div class="lotes-notice-backdrop"></div>
    <section class="lotes-notice-dialog" role="alertdialog" aria-modal="true">
      <div class="lotes-notice-icon" aria-hidden="true">!</div>
      ${titulo ? `<h3>${esc(titulo)}</h3>` : ''}
      <p>${esc(String(mensaje || 'Ocurrió un error.'))}</p>
      <button type="button">Aceptar</button>
    </section>`;
  const cerrarAviso = () => {
    modal.remove();
    if (typeof alCerrar === 'function') alCerrar();
  };
  modal.querySelector('.lotes-notice-backdrop').onclick = cerrarAviso;
  modal.querySelector('button').onclick = cerrarAviso;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.querySelector('button')?.focus());
}

function actualizarRubroVisual(valor = '') {
  const input = $('lotesRubro');
  const texto = $('lotesRubroTexto');
  if (input) input.value = valor;
  if (texto) texto.textContent = valor || 'Seleccionar rubro';
  document.querySelectorAll('[data-rubro-opcion]').forEach((b) => {
    b.classList.toggle('activo', b.dataset.rubroOpcion === valor);
    b.setAttribute('aria-selected', b.dataset.rubroOpcion === valor ? 'true' : 'false');
  });
}

function cerrarSelectorRubro() {
  $('lotesRubroMenu')?.classList.add('oculto');
  $('lotesRubroBtn')?.setAttribute('aria-expanded', 'false');
}

function ajustarCantidad(delta) {
  const input = $('lotesCantidad');
  if (!input) return;
  const actual = Math.max(1, parseInt(input.value, 10) || 1);
  input.value = String(Math.max(1, actual + delta));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function inicializarControlesLotes() {
  $('lotesRubroBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = $('lotesRubroMenu');
    const abrir = menu?.classList.contains('oculto');
    menu?.classList.toggle('oculto', !abrir);
    $('lotesRubroBtn')?.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  });
  document.querySelectorAll('[data-rubro-opcion]').forEach((b) => {
    b.addEventListener('click', () => {
      actualizarRubroVisual(b.dataset.rubroOpcion || '');
      cerrarSelectorRubro();
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.lotes-rubro-custom')) cerrarSelectorRubro();
  });
  $('lotesCantidadMenos')?.addEventListener('click', () => ajustarCantidad(-1));
  $('lotesCantidadMas')?.addEventListener('click', () => ajustarCantidad(1));
  $('lotesCantidad')?.addEventListener('change', () => {
    const input = $('lotesCantidad');
    input.value = String(Math.max(1, parseInt(input.value, 10) || 1));
  });

  const fecha = $('lotesFecha');
  fecha?.addEventListener('click', () => {
    try { fecha.showPicker?.(); } catch {}
  });
}

function activar() {
  inyectarAjustesVisuales();
  $('lotesFab')?.classList.remove('oculto');
  cargar();
}

function desactivar() {
  cerrar();
  $('lotesFab')?.classList.add('oculto');
}

inyectarAjustesVisuales();
inicializarControlesLotes();
$('lotesFab')?.classList.add('oculto');

$('lotesFab')?.addEventListener('click', abrir);
$('btnLotesCargaHeader')?.addEventListener('click', abrir);
$('btnLotesCerrar')?.addEventListener('click', cerrar);
$('lotesBackdrop')?.addEventListener('click', cerrar);
$('btnLotesCamara')?.addEventListener('click', escanear);
$('btnLotesManual')?.addEventListener('click', () => modo('manual'));
$('btnLotesNuevoProducto')?.addEventListener('click', iniciarAltaProvisionalDirecta);
$('btnLotesNuevoProductoCamara')?.addEventListener('click', iniciarAltaProvisionalDirecta);
$('btnLotesManualCamara')?.addEventListener('click', () => {
  detenerScanner();
  modo('manual');
});
$('btnLotesVolverScanner')?.addEventListener('click', escanear);
$('btnLotesBuscarManual')?.addEventListener('click', buscarManual);
$('lotesManualInput')?.addEventListener('input', () => {
  clearTimeout(buscarTimer);
  buscarTimer = setTimeout(buscarManual, 120);
});
$('lotesManualInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') buscarManual();
});
$('btnLotesGuardar')?.addEventListener('click', guardar);
$('lotesBuscar')?.addEventListener('input', render);

document.querySelectorAll('[data-lotes-vencimiento]').forEach((card) => {
  const irAGrupo = () => {
    const bucket = card.dataset.lotesVencimiento;
    lotesGruposAbiertos.clear();
    lotesGruposAbiertos.add(bucket);
    render();
    requestAnimationFrame(() => document.getElementById(`lotesGrupo-${bucket}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  card.addEventListener('click', irAGrupo);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); irAGrupo(); } });
});

document.querySelectorAll('[data-lotes-rubro]').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('[data-lotes-rubro]').forEach((x) => x.classList.remove('activo'));
    b.classList.add('activo');
    render();
  };
});

window.LotesModule = { activar, desactivar, cerrar, reiniciar: cerrar };
