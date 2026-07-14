import { API_BASE_URL } from "./config.js?v=510-pulido-general";
import { iniciarScanner, detenerScanner } from "./scanner.js?v=510-pulido-general";

const $ = id => document.getElementById(id);
let productoActual = null;
let registros = [];
let filtro = "pendiente";
let tab = "cargar";
let iniciado = false;

function apiUrl(ruta){ return `${String(API_BASE_URL||"").replace(/\/$/,"")}${ruta}`; }
async function pedir(ruta, opciones={}){
  const r = await fetch(apiUrl(ruta), {headers:{"Content-Type":"application/json"}, ...opciones});
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) throw new Error(data?.mensaje || "No se pudo conectar");
  return data;
}
function toast(texto, tipo="ok"){
  const t=$("toast"); if(!t) return;
  t.textContent=texto; t.className=`toast mostrar ${tipo}`;
  setTimeout(()=>t.className="toast",1800);
}
function unidades(n){ const v=numero(n); return `${v} ${v===1?"unidad":"unidades"}`; }
function numero(v){ const n=Number(v); return Number.isFinite(n)&&n>=0?n:0; }
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
    if(boton) boton.textContent=abierto?"Cancelar código manual":"Ingresar código manualmente";
    if(abierto) $("repoCodigoManualInput")?.focus();
    else if($("repoCodigoManualInput")) $("repoCodigoManualInput").value="";
  });
  $("btnRepoBuscarManual")?.addEventListener("click",procesarManual);
  $("repoCodigoManualInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")procesarManual();});
  $("btnRepoMenos")?.addEventListener("click",()=>cambiarCantidad(-1));
  $("btnRepoMas")?.addEventListener("click",()=>cambiarCantidad(1));
  $("btnRepoGuardar")?.addEventListener("click",guardar);
  $("btnRepoCancelar")?.addEventListener("click",limpiar);
  $("btnRepoVerRegistro")?.addEventListener("click",()=>cambiarTab("registro"));
  document.querySelectorAll("[data-repo-tab]").forEach(b=>b.addEventListener("click",()=>cambiarTab(b.dataset.repoTab)));
  document.querySelectorAll("[data-repo-filtro]").forEach(b=>b.addEventListener("click",()=>{filtro=b.dataset.repoFiltro; render();}));
  $("repoBuscador")?.addEventListener("input",render);
  $("repoListado")?.addEventListener("click",manejarAccion);
}

export function prepararReposicion(){ cambiarTab("cargar"); }

export async function refrescarReposicion(){
  try { const data=await pedir("/reposicion"); registros=data.registros||[]; render(); }
  catch(e){ toast(e.message,"error"); }
}

async function abrirScanner(){
  $("repoActionsCard")?.classList.add("oculto");
  $("repoCameraCard")?.classList.remove("oculto");
  try { await iniciarScanner("videoReposicion", async codigo=>{ cerrarScanner(); await buscarProducto(codigo); }); }
  catch(e){ $("repoCameraCard")?.classList.add("oculto"); $("repoActionsCard")?.classList.remove("oculto"); toast("No se pudo abrir la cámara","error"); }
}
function cerrarScanner(){ detenerScanner(); $("repoCameraCard")?.classList.add("oculto"); if(!productoActual) $("repoActionsCard")?.classList.remove("oculto"); }
function procesarManual(){ const c=$("repoCodigoManualInput")?.value.trim(); if(!c)return; $("repoCodigoManualInput").value=""; $("repoManualPanel")?.classList.add("oculto"); if($("btnRepoManualToggle")) $("btnRepoManualToggle").textContent="Ingresar código manualmente"; buscarProducto(c); }
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
  if(!productoActual) return;
  const cantidad=Math.max(1,numero($("repoCantidadInput").value));
  try{
    await pedir("/reposicion",{method:"POST",body:JSON.stringify({codigo:productoActual.codigo,articulo:productoActual.articulo,cantidad})});
    toast("Producto guardado correctamente"); limpiar(); await refrescarReposicion();
  }catch(e){toast(e.message,"error");}
}
function limpiar(){ productoActual=null; if($("repoCodigoManualInput")) $("repoCodigoManualInput").value=""; $("repoManualPanel")?.classList.add("oculto"); if($("btnRepoManualToggle")) $("btnRepoManualToggle").textContent="Ingresar código manualmente"; $("repoProductoCard")?.classList.add("oculto"); $("repoFormCard")?.classList.add("oculto"); cerrarScanner(); $("repoActionsCard")?.classList.remove("oculto"); }
function actualizarEncabezadoRepo(esCarga){
  const titulo=$("brandHeaderTitulo");
  const subtitulo=$("brandHeaderSubtitulo");
  if(titulo) titulo.textContent=esCarga?"Anotar reposición":"Registro de reposición";
  if(subtitulo) subtitulo.textContent=esCarga?"Reposición de salón":"Productos para llevar del depósito";
}
function cambiarTab(nueva){
  tab=nueva==="registro"?"registro":"cargar";
  const esCarga=tab==="cargar";
  $("repoCargaVista")?.classList.toggle("oculto",!esCarga);
  $("repoRegistroVista")?.classList.toggle("oculto",esCarga);
  if(!esCarga && filtro!=="pendiente" && filtro!=="completado" && filtro!=="todos") filtro="pendiente";
  actualizarEncabezadoRepo(esCarga);
  document.querySelectorAll("[data-repo-tab]").forEach(b=>b.classList.toggle("activo",b.dataset.repoTab===tab));
  if($("repoBuscador")) $("repoBuscador").value="";
  if(!esCarga){ refrescarReposicion(); render(); } else { refrescarReposicion(); }
}

function render(){ renderRecientes(); renderListado(); }
function renderRecientes(){
  const c=$("repoRecientes"); if(!c)return;
  const items=registros.slice(0,3);
  c.className=items.length?"repo-list":"venc-list-empty";
  c.innerHTML=items.length?items.map(r=>`<article class="repo-mini-card"><div><strong>${escapar(r.articulo)}</strong><small>${fechaCorta(r.fecha)}</small></div><b>${r.cantidad}<small>${numero(r.cantidad)===1?"unidad":"unidades"}</small></b></article>`).join(""):`<span class="empty-icon">📝</span><strong>Todavía no hay productos anotados.</strong><small>Escaneá un producto para comenzar.</small>`;
  const ver=$('btnRepoVerRegistro'); if(ver) ver.disabled=!registros.length;
}
function renderListado(){
  const c=$("repoListado"); if(!c)return;
  document.querySelectorAll("[data-repo-filtro]").forEach(b=>b.classList.toggle("activo",b.dataset.repoFiltro===filtro));
  const q=($("repoBuscador")?.value||"").toLowerCase();
  const items=registros.filter(r=>(filtro==="todos"||r.estado===filtro)&&(!q||r.articulo.toLowerCase().includes(q)||r.codigo.includes(q)));
  c.className=items.length?"repo-list":"venc-list-empty";
  const vacio=filtro==="pendiente"?"No hay productos pendientes.":filtro==="completado"?"No hay productos completados.":"No hay productos para mostrar.";
  c.innerHTML=items.length?items.map(r=>`<article class="repo-item repo-list-row ${r.estado}"><div class="repo-item-main"><strong>${escapar(r.articulo)}</strong><small>${escapar(r.codigo)}</small></div><div class="repo-quantity-badge"><b>${r.cantidad}</b><span>${numero(r.cantidad)===1?"unidad":"unidades"}</span></div><div class="repo-row-footer"><em>${r.estado==="completado"?"✓ Completado":"Pendiente"}</em><button class="repo-primary-action" data-repo-accion="${r.estado==="pendiente"?"completar":"reabrir"}" data-id="${r.id}">${r.estado==="pendiente"?"Marcar completado":"Volver a pendientes"}</button><details class="repo-more"><summary aria-label="Más opciones">⋮</summary><div><button data-repo-accion="editar" data-id="${r.id}">Editar cantidad</button><button class="danger" data-repo-accion="eliminar" data-id="${r.id}">Eliminar</button></div></details></div></article>`).join(""):`<span class="empty-icon">📦</span><strong>${vacio}</strong><small>El registro se actualiza automáticamente.</small>`;
  const pendientes=registros.filter(r=>r.estado==="pendiente");
  const totalUnidades=pendientes.reduce((a,r)=>a+numero(r.cantidad),0);
  $("repoTotales").innerHTML=`<div><span>Productos pendientes</span><strong>${pendientes.length}</strong></div><div><span>Unidades pendientes</span><strong>${totalUnidades}</strong></div>`;
}
async function manejarAccion(e){
  const b=e.target.closest("[data-repo-accion]"); if(!b)return;
  const r=registros.find(x=>x.id===b.dataset.id); if(!r)return;
  const a=b.dataset.repoAccion;
  try{
    if(a==="eliminar"){ if(!confirm(`¿Eliminar ${r.articulo}?`))return; await pedir(`/reposicion/${r.id}`,{method:"DELETE"}); }
    else if(a==="editar"){ const v=prompt("Nueva cantidad",r.cantidad); if(v===null)return; const n=Number(v); if(!Number.isFinite(n)||n<1)return toast("Cantidad inválida","error"); await pedir(`/reposicion/${r.id}`,{method:"PUT",body:JSON.stringify({cantidad:n,estado:r.estado})}); }
    else { await pedir(`/reposicion/${r.id}`,{method:"PUT",body:JSON.stringify({cantidad:r.cantidad,estado:a==="completar"?"completado":"pendiente"})}); }
    await refrescarReposicion();
  }catch(err){toast(err.message,"error");}
}
