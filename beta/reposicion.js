import { API_BASE_URL } from "./config.js?v=6115-final";
import { iniciarScanner, detenerScanner } from "./scanner.js?v=6115-final";
import { ordenarPorBusqueda } from "./search.js?v=6115-final";

const $ = id => document.getElementById(id);
let productoActual = null;
let registros = [];
let tab = "cargar";
let iniciado = false;
let operacionEnCurso = false;
let temporizadorToast = null;
let elementoFocoAntesDelModal = null;
let productosMaestroCache = [];
let listaActual = "1";
let modoEdicion = false;
let borradorEdicion = [];
let snapshotEdicion = [];
let cargandoRegistros = false;
let accionPendienteTrasEdicion = null;
let secuenciaCargaLista = 0;
let listaEdicion = "1";

function apiUrl(ruta){ return `${String(API_BASE_URL||"").replace(/\/$/,"")}${ruta}`; }
async function pedir(ruta, opciones={}){
  const controlador = new AbortController();
  const temporizador = setTimeout(()=>controlador.abort(),15000);
  let r;
  try {
    r = await fetch(apiUrl(ruta), {...opciones, cache:"no-store", headers:{"Content-Type":"application/json",...(opciones.headers||{})}, signal:controlador.signal});
  } catch(error) {
    if(error?.name === "AbortError") throw new Error("El servidor tardó demasiado en responder");
    throw new Error("No se pudo conectar con el servidor");
  } finally { clearTimeout(temporizador); }
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) throw new Error(data?.mensaje || "No se pudo conectar");
  return data;
}
function toast(texto, tipo="ok"){
  const t=$("toast"); if(!t) return;
  clearTimeout(temporizadorToast);
  t.textContent=texto; t.className=`toast mostrar ${tipo}`;
  temporizadorToast=setTimeout(()=>t.className="toast",1800);
}
function unidades(n){ const v=numero(n); return `${v} ${v===1?"unidad":"unidades"}`; }
function numero(v){ const n=Number(v); return Number.isInteger(n)&&n>=0?n:0; }
function escapar(s){ return String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function fechaCorta(valor){
  const d=new Date(valor); if(Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-AR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
}

export function inicializarReposicion(){
  if(iniciado) return; iniciado=true;
  $("btnRepoAbrirScanner")?.addEventListener("click", abrirScanner);
  $("btnRepoCerrarScanner")?.addEventListener("click", cerrarScanner);
  $("btnRepoManualToggle")?.addEventListener("click",()=>{
    const panel=$("repoManualPanel");
    const abierto=panel?.classList.contains("oculto");
    panel?.classList.toggle("oculto", !abierto);
    const boton=$("btnRepoManualToggle");
    if(boton) boton.textContent=abierto?"Cancelar ingreso manual":"Ingresar producto manual";
    if(abierto) $("repoCodigoManualInput")?.focus();
    else if($("repoCodigoManualInput")) { $("repoCodigoManualInput").value=""; limpiarSugerenciasRepo(); }
  });
  $("btnRepoBuscarManual")?.addEventListener("click",procesarManual);
  $("repoCodigoManualInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")procesarManual();});
  $("repoCodigoManualInput")?.addEventListener("input",renderSugerenciasRepo);
  $("btnRepoMenos")?.addEventListener("click",()=>cambiarCantidad(-1));
  $("btnRepoMas")?.addEventListener("click",()=>cambiarCantidad(1));
  $("btnRepoGuardar")?.addEventListener("click",guardar);
  $("btnRepoCancelar")?.addEventListener("click",limpiar);
  $("btnRepoVerRegistro")?.addEventListener("click",()=>cambiarTab("registro"));
  document.querySelectorAll("[data-repo-tab]").forEach(b=>b.addEventListener("click",()=>cambiarTab(b.dataset.repoTab)));
  document.querySelectorAll("[data-repo-lista]").forEach(b=>b.addEventListener("click",()=>seleccionarLista(b.dataset.repoLista)));
  $("repoBuscador")?.addEventListener("input",render);
  $("repoListado")?.addEventListener("click",manejarAccion);
  $("btnRepoVaciarLista")?.addEventListener("click", abrirModalNuevaLista);
  $("btnRepoEditarLista")?.addEventListener("click", alternarModoEdicion);
  $("btnRepoSeguirEditando")?.addEventListener("click", cerrarModalGuardarEdicion);
  $("btnRepoConfirmarEdicion")?.addEventListener("click", confirmarEdicion);
  $("btnRepoContinuarEdicion")?.addEventListener("click", cerrarModalDescartarEdicion);
  $("btnRepoConfirmarDescarte")?.addEventListener("click", descartarEdicion);
  $("btnRepoGuardarAntesSalir")?.addEventListener("click", guardarEdicionAntesDeSalir);
  $("btnRepoCancelarNuevaLista")?.addEventListener("click", cerrarModalNuevaLista);
  $("btnRepoConfirmarNuevaLista")?.addEventListener("click", confirmarNuevaLista);
  $("repoNuevaListaModal")?.addEventListener("click", event => {
    if (event.target === $("repoNuevaListaModal")) cerrarModalNuevaLista();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !$("repoNuevaListaModal")?.classList.contains("oculto")) cerrarModalNuevaLista();
  });
  window.addEventListener("autoservicio:sesion", actualizarUsuarioReposicion);
  sincronizarSelectorListas();
}

export function prepararReposicion(){
  actualizarUsuarioReposicion();
  cargarProductosMaestroRepo();
  seleccionarLista("1", { refrescar: false });
  cambiarTab("cargar");
}

function actualizarUsuarioReposicion(){
  const usuario = window.AutoservicioAuth?.getUsuario?.();
  const nombre = usuario?.nombre || usuario?.usuario || "Mi usuario";
  if ($("repoUsuarioActual")) $("repoUsuarioActual").textContent = nombre;
}

function sincronizarSelectorListas(){
  document.querySelectorAll("[data-repo-lista]").forEach(b=>{
    const activo=String(b.dataset.repoLista||"1")===listaActual;
    b.classList.toggle("activo",activo);
    b.setAttribute("aria-pressed",activo?"true":"false");
  });
  const nombre=`Lista ${listaActual}`;
  const modalNombre=$("repoModalListaNombre"); if(modalNombre) modalNombre.textContent=nombre;
  const toolbar=$("btnRepoVaciarLista"); if(toolbar) toolbar.setAttribute("aria-label",`Empezar nueva ${nombre.toLowerCase()}`);
}

async function seleccionarLista(valor,{refrescar=true}={}){
  const nueva=String(valor)==="2"?"2":"1";
  if(listaActual===nueva && refrescar){ sincronizarSelectorListas(); return; }
  if(modoEdicion) {
    solicitarSalidaEdicion(() => seleccionarLista(nueva,{refrescar}));
    return;
  }
  salirModoEdicionSilencioso();
  listaActual=nueva;
  productoActual=null;
  limpiar();
  registros=[];
  sincronizarSelectorListas();
  render();
  if(refrescar) await refrescarReposicion();
}

export async function refrescarReposicion(){
  const listaSolicitada = listaActual;
  const secuencia = ++secuenciaCargaLista;
  cargandoRegistros=true; render();
  try {
    const data=await pedir(`/reposicion?lista=${listaSolicitada}`);
    if(secuencia !== secuenciaCargaLista || listaActual !== listaSolicitada) return;
    registros=(data.registros||[]).map(item=>({...item,lista:String(item.lista||listaSolicitada)==="2"?"2":"1"}));
    actualizarUsuarioReposicion();
  }
  catch(e){ if(secuencia === secuenciaCargaLista) toast(e.message,"error"); }
  finally {
    if(secuencia === secuenciaCargaLista){ cargandoRegistros=false; render(); }
  }
}

async function abrirScanner(){
  $("repoActionsCard")?.classList.add("oculto");
  $("repoCameraCard")?.classList.remove("oculto");
  try { await iniciarScanner("videoReposicion", async codigo=>{ cerrarScanner(); await buscarProducto(codigo); }); }
  catch(e){ $("repoCameraCard")?.classList.add("oculto"); $("repoActionsCard")?.classList.remove("oculto"); toast("No se pudo abrir la cámara","error"); }
}
function cerrarScanner(){ detenerScanner(); $("repoCameraCard")?.classList.add("oculto"); if(!productoActual) $("repoActionsCard")?.classList.remove("oculto"); }
async function cargarProductosMaestroRepo(){
  if(productosMaestroCache.length) return productosMaestroCache;
  try {
    const data=await pedir("/productos-maestro");
    productosMaestroCache=Array.isArray(data.productos)?data.productos:[];
  } catch(e) { console.warn("No se pudo cargar el catálogo para búsqueda manual",e); }
  return productosMaestroCache;
}
function limpiarSugerenciasRepo(){
  const c=$("repoManualSugerencias"); if(!c)return;
  c.innerHTML=""; c.classList.add("oculto");
}
async function renderSugerenciasRepo(){
  const input=$("repoCodigoManualInput"), c=$("repoManualSugerencias"); if(!input||!c)return;
  const consulta=String(input.value||"").trim();
  if(consulta.length<2){limpiarSugerenciasRepo();return;}
  await cargarProductosMaestroRepo();
  const resultados=ordenarPorBusqueda(productosMaestroCache,consulta,{limite:5,campos:["articulo","codigo"]});
  c.innerHTML="";
  if(!resultados.length){c.innerHTML='<div class="manual-no-results">No se encontraron productos.</div>';c.classList.remove("oculto");return;}
  resultados.forEach(producto=>{
    const b=document.createElement("button"); b.type="button"; b.className="manual-suggestion-item";
    b.innerHTML=`<strong>${escapar(producto.articulo)}</strong><span>${escapar(producto.codigo||"Sin código")}</span>`;
    b.addEventListener("click",()=>{input.value=producto.codigo;limpiarSugerenciasRepo();procesarManual();});
    c.appendChild(b);
  });
  c.classList.remove("oculto");
}
async function procesarManual(){
  const consulta=$("repoCodigoManualInput")?.value.trim(); if(!consulta)return;
  await cargarProductosMaestroRepo();
  const exacto=productosMaestroCache.find(p=>String(p.codigo||"").trim()===consulta);
  let codigo=exacto?.codigo||"";
  if(!codigo){
    const resultados=ordenarPorBusqueda(productosMaestroCache,consulta,{limite:5,campos:["articulo","codigo"]});
    if(resultados.length!==1){renderSugerenciasRepo();toast(resultados.length?"Seleccioná un producto":"Producto no encontrado","error");return;}
    codigo=resultados[0].codigo;
  }
  $("repoCodigoManualInput").value=""; limpiarSugerenciasRepo(); $("repoManualPanel")?.classList.add("oculto");
  if($("btnRepoManualToggle")) $("btnRepoManualToggle").textContent="Ingresar producto manual";
  buscarProducto(codigo);
}
async function buscarProducto(codigo){
  try{
    const data=await pedir(`/producto-maestro/${encodeURIComponent(codigo)}`);
    productoActual=data.producto;
    $("repoNombreProducto").textContent=productoActual.articulo;
    $("repoCodigoProducto").textContent=`Código: ${productoActual.codigo}`;
    $("repoActionsCard")?.classList.add("oculto");
    $("repoProductoCard").classList.remove("oculto"); $("repoFormCard").classList.remove("oculto");
    $("repoCantidadInput").value=1;
  }catch(e){ limpiar(); toast("Producto no encontrado","error"); }
}
function cambiarCantidad(delta){ const i=$("repoCantidadInput"); i.value=Math.max(1,numero(i.value)+delta); }
async function guardar(){
  if(!productoActual || operacionEnCurso) return;
  const cantidad=Math.max(1,numero($("repoCantidadInput").value));
  try{
    operacionEnCurso=true;
    const boton=$("btnRepoGuardar"); if(boton) boton.disabled=true;
    await pedir("/reposicion",{method:"POST",body:JSON.stringify({codigo:productoActual.codigo,articulo:productoActual.articulo,cantidad,lista:listaActual})});
    toast(`Producto agregado a Lista ${listaActual}`); limpiar(); await refrescarReposicion();
  }catch(e){toast(e.message,"error");}
  finally { operacionEnCurso=false; const boton=$("btnRepoGuardar"); if(boton) boton.disabled=false; }
}
function limpiar(){ productoActual=null; if($("repoCodigoManualInput")) $("repoCodigoManualInput").value=""; limpiarSugerenciasRepo(); $("repoManualPanel")?.classList.add("oculto"); if($("btnRepoManualToggle")) $("btnRepoManualToggle").textContent="Ingresar producto manual"; $("repoProductoCard")?.classList.add("oculto"); $("repoFormCard")?.classList.add("oculto"); cerrarScanner(); $("repoActionsCard")?.classList.remove("oculto"); }
function actualizarEncabezadoRepo(esCarga){
  const titulo=$("modulePageTitle");
  const subtitulo=$("modulePageSubtitle");
  if(titulo) titulo.textContent=esCarga?"Lista":"Mi lista";
  if(subtitulo) subtitulo.textContent=esCarga?"Agregar productos":"Productos anotados";
}
function cambiarTab(nueva){
  if(modoEdicion && nueva!=="registro"){ solicitarSalidaEdicion(() => cambiarTab(nueva)); return; }
  if(nueva!=="registro") salirModoEdicionSilencioso();
  tab=nueva==="registro"?"registro":"cargar";
  const esCarga=tab==="cargar";
  $("repoCargaVista")?.classList.toggle("oculto",!esCarga);
  $("repoRegistroVista")?.classList.toggle("oculto",esCarga);
  actualizarEncabezadoRepo(esCarga);
  sincronizarSelectorListas();
  document.querySelectorAll("[data-repo-tab]").forEach(b=>b.classList.toggle("activo",b.dataset.repoTab===tab));
  if($("repoBuscador")) $("repoBuscador").value="";
  if(!esCarga){ refrescarReposicion(); render(); } else { refrescarReposicion(); }
}

function htmlCargando(texto="Cargando..."){ return `<span class="app-spinner" aria-hidden="true"></span><strong>${escapar(texto)}</strong>`; }
function render(){ renderRecientes(); renderListado(); }
function renderRecientes(){
  const c=$("repoRecientes"); if(!c)return;
  if(cargandoRegistros){ c.className="venc-list-empty"; c.innerHTML=htmlCargando("Cargando productos..."); return; }
  const items=registros.slice(0,3);
  c.className=items.length?"repo-list":"venc-list-empty";
  c.innerHTML=items.length?items.map(r=>`<article class="repo-mini-card"><div><strong>${escapar(r.articulo)}</strong><small>${fechaCorta(r.fecha)}</small></div><b>${r.cantidad}</b></article>`).join(""):`<span class="empty-icon">📝</span><strong>Todavía no agregaste productos.</strong><small>Escaneá un producto para comenzar.</small>`;
  const ver=$('btnRepoVerRegistro'); if(ver) ver.disabled=!registros.length;
}
function registrosVista(){ return modoEdicion ? borradorEdicion : registros; }
function hayCambiosEdicion(){
  if(!modoEdicion) return false;
  const a=snapshotEdicion.map(x=>`${x.id}:${x.cantidad}`).sort().join("|");
  const b=borradorEdicion.filter(x=>!x._eliminar).map(x=>`${x.id}:${x.cantidad}`).sort().join("|");
  return a!==b || borradorEdicion.some(x=>x._eliminar);
}
function actualizarControlesEdicion(){
  const editar=$("btnRepoEditarLista");
  const cambios=hayCambiosEdicion();
  if(editar){
    editar.disabled=!registros.length || operacionEnCurso;
    editar.textContent=!modoEdicion?"Editar lista":(cambios?"Guardar lista":"Cancelar edición");
    editar.classList.toggle("activo",modoEdicion);
    editar.classList.toggle("guardar",modoEdicion&&cambios);
  }
  $("btnRepoGuardarEdicion")?.classList.add("oculto");
  const nueva=$("btnRepoVaciarLista"); if(nueva) nueva.disabled=!registros.length || modoEdicion;
}
function entrarModoEdicion(){
  if(!registros.length || operacionEnCurso) return;
  modoEdicion=true;
  listaEdicion=listaActual;
  snapshotEdicion=registros.map(x=>({...x}));
  borradorEdicion=registros.map(x=>({...x,_eliminar:false}));
  render();
}
function salirModoEdicionSilencioso(){ modoEdicion=false; borradorEdicion=[]; snapshotEdicion=[]; listaEdicion=listaActual; actualizarControlesEdicion(); }
function alternarModoEdicion(){
  if(!modoEdicion) return entrarModoEdicion();
  if(hayCambiosEdicion()) return abrirModalGuardarEdicion();
  salirModoEdicionSilencioso(); render();
}
function cambiarCantidadEdicion(id,delta){
  const r=borradorEdicion.find(x=>String(x.id)===String(id)); if(!r||r._eliminar)return;
  r.cantidad=Math.max(1,numero(r.cantidad)+delta); render();
}
function marcarEliminarEdicion(id){
  const r=borradorEdicion.find(x=>String(x.id)===String(id)); if(!r)return;
  r._eliminar=!r._eliminar; render();
}
function abrirModalGuardarEdicion(){
  if(!hayCambiosEdicion()) return;
  const modificados=borradorEdicion.filter(x=>!x._eliminar && snapshotEdicion.some(y=>y.id===x.id&&numero(y.cantidad)!==numero(x.cantidad))).length;
  const eliminados=borradorEdicion.filter(x=>x._eliminar).length;
  const texto=$("repoGuardarEdicionTexto"); if(texto) texto.textContent=`Se modificaron ${modificados} producto${modificados===1?"":"s"} y se eliminarán ${eliminados}.`;
  $("repoGuardarEdicionModal")?.classList.remove("oculto"); document.body.classList.add("modal-abierto");
}
function cerrarModalGuardarEdicion(){ $("repoGuardarEdicionModal")?.classList.add("oculto"); document.body.classList.remove("modal-abierto"); }
function abrirModalDescartarEdicion(){ $("repoDescartarEdicionModal")?.classList.remove("oculto"); document.body.classList.add("modal-abierto"); }
function cerrarModalDescartarEdicion(){ $("repoDescartarEdicionModal")?.classList.add("oculto"); document.body.classList.remove("modal-abierto"); }
function descartarEdicion(){
  const continuar=accionPendienteTrasEdicion; accionPendienteTrasEdicion=null;
  cerrarModalDescartarEdicion(); salirModoEdicionSilencioso(); render();
  if(typeof continuar==="function") continuar();
}
function solicitarSalidaEdicion(continuar){
  if(!modoEdicion){ continuar?.(); return; }
  if(!hayCambiosEdicion()){ salirModoEdicionSilencioso(); render(); continuar?.(); return; }
  accionPendienteTrasEdicion=continuar;
  abrirModalDescartarEdicion();
}
export function resolverSalidaReposicion(continuar){ solicitarSalidaEdicion(continuar); }
async function guardarEdicionAntesDeSalir(){
  const continuar=accionPendienteTrasEdicion; accionPendienteTrasEdicion=null;
  cerrarModalDescartarEdicion();
  const ok=await confirmarEdicion();
  if(ok && typeof continuar==="function") continuar();
}
async function confirmarEdicion(){
  if(!hayCambiosEdicion()||operacionEnCurso)return false;
  const cambios=[];
  for(const item of borradorEdicion){
    if(item._eliminar) cambios.push({id:item.id,codigo:item.codigo,lista:item.lista||listaEdicion,eliminar:true});
    else { const original=snapshotEdicion.find(x=>x.id===item.id); if(original&&numero(original.cantidad)!==numero(item.cantidad)) cambios.push({id:item.id,codigo:item.codigo,lista:item.lista||listaEdicion,cantidad:numero(item.cantidad)}); }
  }
  try{
    operacionEnCurso=true; const b=$("btnRepoConfirmarEdicion"); if(b){b.disabled=true;b.textContent="Guardando...";}
    const data=await pedir("/reposicion",{method:"PATCH",body:JSON.stringify({lista:listaEdicion,cambios})});
    registros=data.registros||[]; cerrarModalGuardarEdicion(); salirModoEdicionSilencioso(); render(); toast("Cambios guardados"); return true;
  }catch(e){toast(e.message,"error"); return false;}
  finally{operacionEnCurso=false;const b=$("btnRepoConfirmarEdicion");if(b){b.disabled=false;b.textContent="Guardar cambios";} actualizarControlesEdicion();}
}
function renderListado(){
  const c=$("repoListado"); if(!c)return;
  if(cargandoRegistros){ c.className="venc-list-empty"; c.innerHTML=htmlCargando("Cargando lista..."); actualizarControlesEdicion(); return; }
  const q=($("repoBuscador")?.value||"").trim();
  const fuente=registrosVista().filter(r=>!r._eliminar || modoEdicion);
  const pendientes=fuente.filter(r=>r.estado!=="completado");
  const completados=fuente.filter(r=>r.estado==="completado");
  const items=q ? [...ordenarPorBusqueda(pendientes,q,{limite:200,campos:["articulo","codigo"]}),...ordenarPorBusqueda(completados,q,{limite:200,campos:["articulo","codigo"]})] : [...pendientes,...completados];
  c.className=items.length?"repo-list repo-simple-list":"venc-list-empty";
  actualizarControlesEdicion();
  c.innerHTML=items.length?items.map(r=>{
    const completado=r.estado==="completado";
    if(modoEdicion) return `<article class="repo-simple-item repo-edit-item${r._eliminar?" marcado-eliminar":""}">
      <button type="button" class="repo-delete-edit" data-repo-accion="eliminar-edicion" data-id="${escapar(r.id)}" aria-label="${r._eliminar?"Restaurar":"Eliminar"}">${r._eliminar?"↩":"×"}</button>
      <div class="repo-simple-copy"><strong>${escapar(r.articulo)}</strong><small>${escapar(r.codigo)}</small></div>
      <div class="repo-qty-editor"><button type="button" data-repo-accion="menos-edicion" data-id="${escapar(r.id)}" ${r._eliminar?"disabled":""}>−</button><b>${numero(r.cantidad)}</b><button type="button" data-repo-accion="mas-edicion" data-id="${escapar(r.id)}" ${r._eliminar?"disabled":""}>+</button></div>
    </article>`;
    return `<article class="repo-simple-item${completado?" completado":""}">
      <button type="button" class="repo-check${completado?" completado":""}" data-repo-accion="${completado?"pendiente":"completar"}" data-id="${escapar(r.id)}" aria-label="${completado?"Volver a pendiente":"Marcar como llevado"}">✓</button>
      <div class="repo-simple-copy"><strong>${escapar(r.articulo)}</strong><small>${escapar(r.codigo)}${completado?' · Listo':''}</small></div>
      <b class="repo-simple-qty">${numero(r.cantidad)}</b>
    </article>`;
  }).join(""):`<span class="empty-icon">📦</span><strong>No hay productos anotados.</strong><small>Los productos que agregues aparecerán acá.</small>`;
}

function ocultarToast(){
  const t=$("toast");
  clearTimeout(temporizadorToast);
  if(t){ t.className="toast"; t.textContent=""; }
}

function abrirModalNuevaLista(){
  if(operacionEnCurso || !registros.length) return;
  const modal=$("repoNuevaListaModal");
  if(!modal) return confirmarNuevaLista();
  ocultarToast();
  elementoFocoAntesDelModal=document.activeElement;
  modal.classList.remove("oculto");
  modal.setAttribute("aria-hidden","false");
  document.body.classList.add("modal-abierto");
  requestAnimationFrame(()=>$("btnRepoCancelarNuevaLista")?.focus());
}

function cerrarModalNuevaLista(){
  if(operacionEnCurso) return;
  const modal=$("repoNuevaListaModal");
  modal?.classList.add("oculto");
  modal?.setAttribute("aria-hidden","true");
  document.body.classList.remove("modal-abierto");
  if(elementoFocoAntesDelModal instanceof HTMLElement) elementoFocoAntesDelModal.focus();
  elementoFocoAntesDelModal=null;
}

async function confirmarNuevaLista(){
  if(operacionEnCurso || !registros.length) return;
  try {
    operacionEnCurso=true;
    const boton=$("btnRepoConfirmarNuevaLista"); if(boton){ boton.disabled=true; boton.textContent="Comenzando..."; }
    const botonLista=$("btnRepoVaciarLista"); if(botonLista) botonLista.disabled=true;
    await pedir(`/reposicion?lista=${listaActual}`,{method:"DELETE"});
    registros=[]; render();
    const modal=$("repoNuevaListaModal");
    modal?.classList.add("oculto");
    modal?.setAttribute("aria-hidden","true");
    document.body.classList.remove("modal-abierto");
    elementoFocoAntesDelModal=null;
    toast(`Lista ${listaActual} lista para comenzar`);
  } catch(error){ toast(error.message,"error"); }
  finally {
    operacionEnCurso=false;
    const boton=$("btnRepoConfirmarNuevaLista"); if(boton){ boton.disabled=false; boton.textContent="Empezar nueva lista"; }
    const botonLista=$("btnRepoVaciarLista"); if(botonLista) botonLista.disabled=!registros.length;
  }
}

async function manejarAccion(e){
  const b=e.target.closest("[data-repo-accion]");
  if(!b || operacionEnCurso) return;

  const id=String(b.dataset.id||"");
  const r=registros.find(x=>String(x.id)===id);
  if(!r) return toast("No se encontró el producto en la lista","error");

  const accion=String(b.dataset.repoAccion||"");
  if(modoEdicion){
    if(accion==="menos-edicion") return cambiarCantidadEdicion(id,-1);
    if(accion==="mas-edicion") return cambiarCantidadEdicion(id,1);
    if(accion==="eliminar-edicion") return marcarEliminarEdicion(id);
    return;
  }
  const estadoAnterior=r.estado||"pendiente";
  const listaRegistro=String(r.lista||listaActual)==="2"?"2":"1";

  try{
    operacionEnCurso=true;
    b.disabled=true;

    if(accion==="eliminar"){
      if(!confirm(`¿Eliminar ${r.articulo}?`)) return;
      await pedir(`/reposicion/${encodeURIComponent(r.id)}?lista=${listaRegistro}&codigo=${encodeURIComponent(r.codigo||"")}`,{method:"DELETE"});
      registros=registros.filter(item=>String(item.id)!==id);
      render();
      return;
    }

    if(accion==="editar"){
      const valor=prompt("Nueva cantidad",r.cantidad);
      if(valor===null) return;
      const cantidad=Number(valor);
      if(!Number.isInteger(cantidad)||cantidad<1) return toast("Cantidad inválida","error");
      await pedir(`/reposicion/${encodeURIComponent(r.id)}`,{method:"PUT",body:JSON.stringify({cantidad,estado:r.estado||"pendiente",lista:listaRegistro,codigo:r.codigo})});
      r.cantidad=cantidad;
      render();
      return;
    }

    const nuevoEstado=accion==="completar"?"completado":"pendiente";

    // Cambio visual inmediato: la tarjeta cambia de color y se reordena sin esperar al servidor.
    r.estado=nuevoEstado;
    render();

    await pedir(`/reposicion/${encodeURIComponent(r.id)}`,{
      method:"PUT",
      body:JSON.stringify({cantidad:numero(r.cantidad),estado:nuevoEstado,lista:listaRegistro,codigo:r.codigo})
    });

    toast(nuevoEstado==="completado"?"Producto marcado como listo":"Producto devuelto a pendientes");
  }catch(err){
    r.estado=estadoAnterior;
    render();
    toast(err.message,"error");
  }finally{
    operacionEnCurso=false;
    const botonActual=document.querySelector(`[data-repo-accion][data-id="${CSS.escape(id)}"]`);
    if(botonActual) botonActual.disabled=false;
  }
}
