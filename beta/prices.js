import { API_BASE_URL } from './config.js?v=6118-precios';
import { coincideBusqueda } from './search.js?v=6118-precios';

const $ = id => document.getElementById(id);
const LAST_KEY = 'autoservicio-precios-ultimo-v1';
let productos = [];
let cargados = false;
let cargando = null;
let lector = null;
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
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n);
}
function normalizarProducto(p) {
  return { codigo: String(p?.codigo || '').trim(), articulo: String(p?.articulo || 'Producto').trim(), precio: precioNumero(p?.precio) };
}
async function cargarProductos() {
  if (cargados) return productos;
  if (cargando) return cargando;
  cargando = fetch(`${API_BASE_URL}/productos-maestro`, { cache: 'no-store' })
    .then(async r => { const d=await r.json(); if(!r.ok || !d.ok) throw new Error(d.mensaje || 'No se pudieron cargar los productos'); return (d.productos||[]).map(normalizarProducto); })
    .then(lista => { productos=lista; cargados=true; return lista; })
    .finally(() => { cargando=null; });
  return cargando;
}
function guardarUltimo(p) {
  localStorage.setItem(LAST_KEY, JSON.stringify(p));
  renderUltimo(p);
}
function leerUltimo() {
  try { const raw=JSON.parse(localStorage.getItem(LAST_KEY)||'null'); return raw ? normalizarProducto(raw) : null; } catch { return null; }
}
function renderUltimo(p) {
  const box=$('precioUltimoResultado'); if(!box) return;
  if(!p || (!p.codigo && !p.articulo)) {
    box.className='precio-ultimo-vacio';
    box.innerHTML='<span class="empty-icon">$</span><strong>Todavía no consultaste productos.</strong><small>Escaneá o buscá un producto para comenzar.</small>';
    return;
  }
  const precio=formatearPrecio(p.precio);
  box.className='precio-ultimo-producto';
  box.innerHTML=`<strong>${esc(p.articulo)}</strong><small>${esc(p.codigo)}</small><div class="precio-valor ${precioNumero(p.precio)>0?'':'sin-precio'}">${esc(precio)}</div>`;
}
function esc(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function buscar(texto, limite=5) {
  const q=String(texto||'').trim(); if(!q) return [];
  return productos.filter(p=>coincideBusqueda(q,p.articulo,p.codigo)).slice(0,limite);
}
function renderSugerencias() {
  const cont=$('precioManualSugerencias'); const q=$('precioManualInput')?.value||''; if(!cont) return;
  const lista=buscar(q,5);
  if(!q.trim()){cont.classList.add('oculto');cont.innerHTML='';return;}
  cont.classList.remove('oculto');
  cont.innerHTML=lista.length?lista.map((p,i)=>`<button type="button" data-precio-sugerencia="${i}"><strong>${esc(p.articulo)}</strong><small>${esc(p.codigo)}</small></button>`).join(''):'<div class="manual-no-results">No se encontraron productos</div>';
  cont.querySelectorAll('[data-precio-sugerencia]').forEach((b,i)=>b.addEventListener('click',()=>seleccionar(lista[i])));
}
function seleccionar(p) {
  if(!p) return; guardarUltimo(p); detenerScanner();
  $('precioManualPanel')?.classList.add('oculto'); $('precioManualSugerencias')?.classList.add('oculto');
  if($('precioManualInput')) $('precioManualInput').value='';
  cambiarTab('consultar');
}
async function buscarCodigo(codigo) {
  await cargarProductos();
  const p=productos.find(x=>x.codigo===String(codigo||'').trim());
  if(p) seleccionar(p); else window.dispatchEvent(new CustomEvent('autoservicio-toast',{detail:{texto:'Producto no encontrado'}}));
}
async function iniciarScanner() {
  detenerScanner();
  const card=$('precioCameraCard'); card?.classList.remove('oculto');
  if(!window.ZXing){ alert('No se pudo iniciar el escáner.'); return; }
  lector=new ZXing.BrowserMultiFormatReader(); scannerActivo=true;
  try {
    await lector.decodeFromConstraints({video:{facingMode:{ideal:'environment'}}},'videoPrecios',(result)=>{
      if(result && scannerActivo){ const codigo=result.getText?.()||result.text; buscarCodigo(codigo); }
    });
  } catch(e){ scannerActivo=false; card?.classList.add('oculto'); alert('No se pudo abrir la cámara.'); }
}
function detenerScanner(){ scannerActivo=false; try{lector?.reset?.();}catch{} lector=null; $('precioCameraCard')?.classList.add('oculto'); }
function cambiarTab(tab){
  tabActual=tab;
  if(tab==='productos') cantidadVisible=100;
  $('preciosConsultarVista')?.classList.toggle('oculto',tab!=='consultar');
  $('preciosProductosVista')?.classList.toggle('oculto',tab!=='productos');
  document.querySelectorAll('[data-precio-tab]').forEach(b=>b.classList.toggle('activo',b.dataset.precioTab===tab));
  if(tab==='productos') renderProductos(); else detenerScanner();
}
function renderProductos(){
  const q=$('precioBuscadorProductos')?.value||'';
  let lista=q.trim()?productos.filter(p=>coincideBusqueda(q,p.articulo,p.codigo)):productos;
  const cont=$('precioListaProductos'); const resumen=$('precioResumenProductos');
  if(resumen) resumen.textContent=`${lista.length} productos`;
  if(!cont)return;
  const visibles=lista.slice(0,cantidadVisible);
  cont.innerHTML=visibles.map(p=>`<button type="button" class="precio-product-row" data-precio-index="${productos.indexOf(p)}"><span><strong>${esc(p.articulo)}</strong><small>${esc(p.codigo)}</small></span><b class="${precioNumero(p.precio)>0?'':'sin-precio'}">${esc(formatearPrecio(p.precio))}</b></button>`).join('') || '<div class="precio-ultimo-vacio"><strong>No se encontraron productos.</strong></div>';
  if (lista.length > cantidadVisible) cont.insertAdjacentHTML('beforeend', `<button type="button" id="btnPrecioMostrarMas" class="precio-mostrar-mas">Mostrar más (${lista.length-cantidadVisible})</button>`);
  cont.querySelectorAll('[data-precio-index]').forEach(b=>b.addEventListener('click',()=>seleccionar(productos[Number(b.dataset.precioIndex)])));
  $('btnPrecioMostrarMas')?.addEventListener('click',()=>{cantidadVisible+=100;renderProductos();});
}
async function activar(){
  renderUltimo(leerUltimo()); cambiarTab(tabActual);
  try{ await cargarProductos(); if(tabActual==='productos')renderProductos(); }catch(e){ const r=$('precioResumenProductos');if(r)r.textContent='No se pudieron cargar los productos'; }
}
function desactivar(){ detenerScanner(); }
function init(){
  $('btnPrecioAbrirScanner')?.addEventListener('click',iniciarScanner);
  $('btnPrecioCerrarScanner')?.addEventListener('click',detenerScanner);
  $('btnPrecioManualToggle')?.addEventListener('click',async()=>{ await cargarProductos().catch(()=>{}); $('precioManualPanel')?.classList.toggle('oculto'); $('precioManualInput')?.focus(); });
  $('precioManualInput')?.addEventListener('input',renderSugerencias);
  $('precioManualInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){const p=buscar(e.currentTarget.value,1)[0];if(p)seleccionar(p);}});
  $('btnPrecioBuscarManual')?.addEventListener('click',()=>{const p=buscar($('precioManualInput')?.value,1)[0];if(p)seleccionar(p);else renderSugerencias();});
  $('precioBuscadorProductos')?.addEventListener('input',()=>{cantidadVisible=100;renderProductos();});
  document.querySelectorAll('[data-precio-tab]').forEach(b=>b.addEventListener('click',()=>cambiarTab(b.dataset.precioTab)));
}
init();
window.PreciosModule={activar,desactivar};
