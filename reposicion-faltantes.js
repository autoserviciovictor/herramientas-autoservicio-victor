import { API_BASE_URL } from './config.js?v=1960-d21-cierre-etapa6-010926';
const $ = id => document.getElementById(id);
let visible = false;
let items = [];
let peticion = 0;
const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(ruta, options={}) {
  const res = await fetch(`${String(API_BASE_URL || '').replace(/\/$/,'')}/reposicion/faltantes${ruta}`, {
    ...options, cache:'no-store', headers:{'Content-Type':'application/json',...(options.headers||{})}
  });
  const tipo = res.headers.get('content-type') || '';
  if (!tipo.includes('application/json')) {
    throw new Error('La lista compartida todavía no está disponible en el servidor. Hay que publicar la actualización del backend (server.js y db-faltantes.js).');
  }
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo actualizar la lista');
  return data;
}
function mostrarError(error) { window.alert(error?.message || 'Error al guardar el faltante'); }
let filtro = 'todos';
let errorConexion = '';

function dibujar() {
  const destino = $('repoFaltantesListado'); if (!destino) return;
  const pendientes = items.filter(x => !x.conseguido).length;
  $('repoFaltantesContador').textContent = `${pendientes} pendiente${pendientes === 1 ? '' : 's'}`;
  const productos = items.length;
  const unidades = items.reduce((total, item) => total + (Number(item.cantidad) || 0), 0);
  const fechas = items.map(item => Date.parse(item.actualizado || '')).filter(Number.isFinite);
  const ultimaFecha = fechas.length ? new Date(Math.max(...fechas)) : null;
  if ($('repoFaltantesResumenProductos')) $('repoFaltantesResumenProductos').textContent = String(productos);
  if ($('repoFaltantesResumenUnidades')) $('repoFaltantesResumenUnidades').textContent = `${unidades} un.`;
  if ($('repoFaltantesResumenActualizado')) $('repoFaltantesResumenActualizado').textContent = ultimaFecha ? ultimaFecha.toLocaleString('es-AR', {dateStyle:'short',timeStyle:'short'}) : '—';
  const q = ($('repoFaltantesBuscar')?.value || '').toLocaleLowerCase('es').trim();
  const visibles = items.filter(x => x.nombre.toLocaleLowerCase('es').includes(q) && (filtro === 'todos' || (filtro === 'pendientes' ? !x.conseguido : x.conseguido)))
    .sort((a,b) => Number(a.conseguido)-Number(b.conseguido));
  destino.className = `repo-products-list${visibles.length ? '' : ' vacio'}`;
  destino.innerHTML = visibles.length ? visibles.map(x => `<article class="repo-product-row${x.conseguido ? ' completado' : ''}" data-id="${escapar(x.id)}">
    <button type="button" class="repo-confirm-check${x.conseguido ? ' completado' : ''}" data-accion="estado" aria-label="${x.conseguido ? 'Volver a pendiente' : 'Marcar como conseguido'}" aria-pressed="${x.conseguido}">
      <svg class="app-icon" aria-hidden="true"><use href="#icon-check"></use></svg>
    </button>
    <span class="repo-row-product-icon" aria-hidden="true"><svg class="app-icon"><use href="#icon-box"></use></svg></span>
    <div class="repo-row-copy"><strong>${escapar(x.nombre)}</strong></div>
    <span class="repo-row-qty">${Number(x.cantidad)} un.</span>
    <button type="button" class="repo-row-more" data-accion="eliminar" aria-label="Eliminar ${escapar(x.nombre)}" title="Eliminar producto">
      <svg class="app-icon" aria-hidden="true"><use href="#icon-trash"></use></svg>
    </button></article>`).join('') : `<div class="repo-empty-state"><span class="repo-empty-icon"><svg class="app-icon" aria-hidden="true"><use href="#icon-box"></use></svg></span><strong>${items.length ? 'No encontramos productos.' : 'No hay productos anotados.'}</strong><small>${items.length ? 'Probá con otra búsqueda o filtro.' : 'Los productos que agregues aparecerán acá.'}</small><button type="button" id="repoFaltantesVacioCargar">+ Cargar productos</button></div>`;
  if (errorConexion) {
    destino.insertAdjacentHTML('afterbegin', `<div class="repo-faltantes-aviso" role="status"><span>${escapar(errorConexion)}</span><button type="button" id="repoFaltantesReintentar">Reintentar</button></div>`);
    $('repoFaltantesReintentar')?.addEventListener('click', refrescar);
  }
  $('repoFaltantesVacioCargar')?.addEventListener('click', abrirEditor);
}
function abrirEditor() { $('repoFaltantesModal')?.classList.remove('oculto'); $('repoFaltantesTexto')?.focus(); }
function cerrarEditor() { $('repoFaltantesModal')?.classList.add('oculto'); }
function parsearLineas(texto) {
  return texto.split(/\r?\n/).map(linea => linea.trim()).filter(Boolean).map(linea => {
    const m = linea.match(/^(\d+)\s+(.+)$/);
    return { nombre: (m ? m[2] : linea).trim(), cantidad: m ? Number(m[1]) : 1 };
  }).filter(x => x.nombre && Number.isInteger(x.cantidad) && x.cantidad > 0 && x.cantidad <= 99999);
}
async function refrescar() {
  const actual = ++peticion;
  try { const data = await api(''); if (actual === peticion) { items=Array.isArray(data.registros) ? data.registros : []; errorConexion=''; dibujar(); } }
  catch(e) { if (actual === peticion) { errorConexion=e.message || 'No se pudo conectar con el servidor compartido.'; dibujar(); } }
}
function ocultar() {
  visible = false;
  $('repoFaltantesPanel')?.classList.add('oculto');
  $('repoTabFaltantes')?.classList.remove('activo');
  $('repoTabFaltantes')?.setAttribute('aria-pressed','false');
  document.querySelector('#pantallaAnotar .repo-main-column')?.classList.remove('repo-mostrando-faltantes');
  document.querySelector('#pantallaAnotar .repo-workspace')?.classList.remove('repo-mostrando-faltantes');
  $('repoFaltantesResumen')?.classList.add('oculto');
  $('repoFaltantesRecientes')?.classList.add('oculto');
}
window.RepoFaltantes = { ocultar };
function mostrar() {
  visible = true;
  document.querySelectorAll('#pantallaAnotar [data-repo-lista]').forEach(b=>b.classList.remove('activo'));
  $('repoTabFaltantes').classList.add('activo');
  $('repoTabFaltantes').setAttribute('aria-pressed','true');
  $('repoFaltantesPanel').classList.remove('oculto');
  document.querySelector('#pantallaAnotar .repo-main-column')?.classList.add('repo-mostrando-faltantes');
  document.querySelector('#pantallaAnotar .repo-workspace')?.classList.add('repo-mostrando-faltantes');
  $('repoFaltantesResumen')?.classList.remove('oculto');
  $('repoFaltantesRecientes')?.classList.remove('oculto');
  refrescar();
}
function iniciar() {
  dibujar();
  $('repoTabFaltantes')?.addEventListener('click', mostrar);
  $('repoFaltantesBuscar')?.addEventListener('input', dibujar);
  $('repoFaltantesNueva')?.addEventListener('click', abrirEditor);
  $('repoFaltantesCerrar')?.addEventListener('click', cerrarEditor);
  $('repoFaltantesModal')?.addEventListener('click', e => { if (e.target.id === 'repoFaltantesModal') cerrarEditor(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarEditor(); });
  $('repoFaltantesFiltroBoton')?.addEventListener('click', () => {
    const menu = $('repoFaltantesFiltroMenu'); const abrir = menu.classList.toggle('oculto') === false;
    $('repoFaltantesFiltroBoton').setAttribute('aria-expanded', String(abrir));
  });
  $('repoFaltantesFiltroMenu')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-faltantes-filtro]'); if (!btn) return;
    filtro = btn.dataset.faltantesFiltro;
    $('repoFaltantesFiltroMenu').querySelectorAll('button').forEach(b => b.classList.toggle('activo', b === btn));
    $('repoFaltantesFiltroMenu').classList.add('oculto');
    $('repoFaltantesFiltroBoton').setAttribute('aria-expanded','false'); dibujar();
  });
  $('repoFaltantesForm')?.addEventListener('submit', async e => {
    e.preventDefault(); const lineas = parsearLineas($('repoFaltantesTexto').value);
    if (!lineas.length) { window.alert('Escribí al menos un producto.'); return; }
    const boton = e.currentTarget.querySelector('button[type="submit"]'); boton.disabled = true;
    try {
      for (const {nombre,cantidad} of lineas) await api('', {method:'POST',body:JSON.stringify({nombre,cantidad})});
      $('repoFaltantesTexto').value=''; cerrarEditor(); await refrescar();
    } catch(error) { mostrarError(error); await refrescar(); } finally { boton.disabled=false; }
  });
  $('repoFaltantesListado')?.addEventListener('click', async e => {
    const boton = e.target.closest('[data-accion]'); if (!boton) return;
    const id = boton.closest('[data-id]')?.dataset.id;
    if (boton.dataset.accion === 'estado') {
      try { await api(`/${id}`, {method:'PATCH',body:JSON.stringify({conseguido:boton.getAttribute('aria-pressed') !== 'true'})}); await refrescar(); }
      catch(error) { mostrarError(error); await refrescar(); }
    } else if (boton.dataset.accion === 'eliminar') {
      if (!confirm('¿Eliminar este producto de la lista compartida?')) return;
      try { await api(`/${id}`, {method:'DELETE'}); await refrescar(); } catch(error) { mostrarError(error); }
    }
  });
  document.addEventListener('visibilitychange', () => { if(visible && !document.hidden) refrescar(); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
