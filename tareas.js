import { API_BASE_URL } from "./config.js?v=1222";
import { escapeHTML as esc, formatDuration as duracionTexto } from "./shared/dom-utils.js?v=1222";
import { shiftSectionTemplate, emptyTaskListTemplate } from "./modules/tareas/task-view.js?v=1222";

const $ = id => document.getElementById(id);
const KEY = "autoservicio_tareas_v3";
const OLD_KEYS = ["autoservicio_tareas_v2","autoservicio_tareas_v1"];
const BANO_KEY = "autoservicio_bano_config_v1";
const BANO_HISTORY_KEY = "autoservicio_bano_historial_v1";
const PENDING_KEY = "autoservicio_tareas_pendientes_v1";
const DIAS = ["DOM","LUN","MAR","MIÉ","JUE","VIE","SÁB"];
const TURNOS = {manana:"Mañana",tarde:"Tarde"};
let fechaSeleccionada = inicioDia(new Date());
let semanaBase = inicioSemana(fechaSeleccionada);
let tareaEditando = null;
let activo = false;
let vistaActual = "tareas";
let sectorSeleccionado = "";
let usuariosTareas = [];
let configSubvista = "tareas";
let asignarDisponibles = [];
let solicitudResponsables = 0;
let tareasMemoria = [];
let contextoTareas = { sectores:[], puedeAsignar:false, puedeConfigurar:false };
let guardadoRemotoEnCurso = Promise.resolve();
let banoMemoria = null;
let asignacionEditando = null;
let asignarUsuarioSeleccionado = "";
let asignarTareasSeleccionadas = new Set();
let activacionTareasEnCurso = null;

function inicioDia(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function inicioSemana(d){ const x=inicioDia(d), day=x.getDay(); x.setDate(x.getDate()-(day===0?6:day-1)); return x; }
function iso(d){ const x=inicioDia(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; }
function parseFecha(v){ const [y,m,d]=String(v||"").split("-").map(Number); return y?new Date(y,m-1,d):inicioDia(new Date()); }
function fmt(d,opt={}){ return new Intl.DateTimeFormat("es-AR",opt).format(d); }
function leerJSON(key, fallback){ try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}catch{return fallback;} }
function guardarJSON(key,v){ localStorage.setItem(key,JSON.stringify(v)); }
function leer(){ return tareasMemoria.length || localStorage.getItem(KEY) ? tareasMemoria : leerJSON(KEY,[]); }
function guardarLocal(v){ tareasMemoria=Array.isArray(v)?v:[]; guardarJSON(KEY,tareasMemoria); }
async function sincronizarTareas(v, deletedIds=[]){
  if(!["administrador","supervisor"].includes(usuario()?.rol)) return false;
  const anterior=leerJSON(PENDING_KEY,{tareas:[],deletedIds:[]});
  const pendientes={tareas:Array.isArray(v)?v:[],deletedIds:[...new Set([...(anterior?.deletedIds||[]),...deletedIds].filter(Boolean))]};
  guardarJSON(PENDING_KEY,pendientes);
  let exito=false;
  guardadoRemotoEnCurso=guardadoRemotoEnCurso.then(async()=>{
    const r=await fetch(`${API_BASE_URL}/tareas`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(pendientes)});
    const data=await r.json(); if(!r.ok||!data.ok) throw new Error(data.mensaje||"No se pudieron sincronizar las tareas");
    if(Array.isArray(data.tareas)) guardarLocal(data.tareas);
    localStorage.removeItem(PENDING_KEY); exito=true;
  }).catch(error=>window.AutoservicioDialog?.alert?.({title:"Cambios guardados en el dispositivo",message:`${error.message||"No se pudo conectar con el servidor"}. Se volverán a enviar automáticamente al ingresar nuevamente.`}));
  await guardadoRemotoEnCurso;
  return exito;
}
function guardar(v,opciones={}){ guardarLocal(v); void sincronizarTareas(v,opciones.deletedIds||[]); }
async function cargarContextoTareas(){
  const intentos=[`${API_BASE_URL}/tareas/contexto`,`${API_BASE_URL}/horarios/contexto`];
  for(const url of intentos){
    try{
      const r=await fetch(url),data=await r.json();
      if(r.ok&&data.ok&&Array.isArray(data.sectores)&&data.sectores.length){
        contextoTareas={...contextoTareas,...data,puedeAsignar:data.puedeAsignar??["administrador","supervisor"].includes(usuario()?.rol),puedeConfigurar:data.puedeConfigurar??["administrador","supervisor"].includes(usuario()?.rol)};
        return;
      }
    }catch{}
  }
  contextoTareas={sectores:[],puedeAsignar:false,puedeConfigurar:["administrador","supervisor"].includes(usuario()?.rol),errorSectores:true};
}
async function cargarTareasRemotas(){
  const locales=leerJSON(KEY,[]),pendientes=leerJSON(PENDING_KEY,null);
  try{
    if(pendientes?.tareas&&["administrador","supervisor"].includes(usuario()?.rol)) await sincronizarTareas(pendientes.tareas,pendientes.deletedIds||[]);
    const r=await fetch(`${API_BASE_URL}/tareas`),data=await r.json();
    if(!r.ok||!data.ok)throw new Error(data.mensaje||"No se pudieron cargar las tareas");
    tareasMemoria=Array.isArray(data.tareas)?data.tareas:[];
    if(usuario()?.rol==="administrador"&&!tareasMemoria.length&&locales.length){guardarLocal(locales);await sincronizarTareas(locales);tareasMemoria=locales;}
    else guardarLocal(tareasMemoria);
  }catch{tareasMemoria=locales;}
}
function usuario(){ return window.AutoservicioAuth?.getUsuario?.() || {}; }
function puedeAsignar(){ return contextoTareas.puedeAsignar || ["administrador","supervisor"].includes(usuario()?.rol); }
function puedeConfigurar(){ return contextoTareas.puedeConfigurar || ["administrador","supervisor"].includes(usuario()?.rol); }
function claveSector(v){ return String(v||"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es"); }
function sectoresUnicos(valores){ const mapa=new Map(); for(const valor of valores){ const limpio=String(valor||"").trim(); if(!limpio)continue; const clave=claveSector(limpio); if(!mapa.has(clave))mapa.set(clave,limpio); } return [...mapa.values()]; }
function sectoresUsuario(){ return sectoresUnicos((contextoTareas.sectores||[]).map(s=>s.nombre||s.id)); }
function todosLosSectores(){ const delContexto=sectoresUsuario(); const deTareas=leer().map(t=>t.sector).filter(Boolean); return sectoresUnicos([...delContexto,...deTareas]).sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"})); }
function sectoresPermitidos(){ return sectoresUsuario().length?sectoresUsuario():todosLosSectores(); }
function sectorInicialUsuario(){
  const u=usuario()||{};
  return String(u.sector||u.sectorPersonal||u.sector_principal||u.sectorPrincipal||"").trim();
}
function normalizarSector(){
  const permitidos=sectoresPermitidos();
  const preferido=sectorInicialUsuario();
  if(!sectorSeleccionado){
    sectorSeleccionado=(preferido&&permitidos.includes(preferido)?preferido:permitidos[0])||preferido||"";
    return;
  }
  if(permitidos.length&&!permitidos.includes(sectorSeleccionado)) sectorSeleccionado=(preferido&&permitidos.includes(preferido)?preferido:permitidos[0])||"";
}
function normalizarTurnoPermitido(v){ const x=String(v||"").toLowerCase(); if(x==="manana"||x==="tarde"||x==="ambos")return x; if(x.includes("15:00")||x.includes("tarde"))return "tarde"; return "manana"; }
function duracionAInput(v){ const n=Math.max(1,Number(v)||10),h=Math.floor(n/60),m=n%60; return `${String(Math.min(h,8)).padStart(2,"0")}:${String(m).padStart(2,"0")}`; }
function duracionDesdeInput(v){ const [h,m]=String(v||"").split(":").map(Number); return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:0; }
function prepararSelectorDuracion(){
  const horas=$("tareaDuracionHoras"),mins=$("tareaDuracionMinutos");
  if(!horas||!mins)return;
  horas.innerHTML=Array.from({length:9},(_,i)=>`<option value="${i}">${i} h</option>`).join("");
  mins.innerHTML=Array.from({length:60},(_,i)=>`<option value="${i}">${String(i).padStart(2,"0")} min</option>`).join("");
  const sync=()=>{$("tareaDuracion").value=`${String(horas.value).padStart(2,"0")}:${String(mins.value).padStart(2,"0")}`;};
  horas.onchange=sync;mins.onchange=sync;
}
function establecerDuracionSelector(total){
  const n=Math.max(1,Number(total)||10),h=Math.min(8,Math.floor(n/60)),m=n%60;
  $("tareaDuracionHoras").value=String(h);$("tareaDuracionMinutos").value=String(m);
  $("tareaDuracion").value=duracionAInput(n);
}

function migrar(){
  if(localStorage.getItem(KEY))return;
  let prev=[]; for(const k of OLD_KEYS){prev=leerJSON(k,[]);if(prev.length)break;}
  const hoy=iso(new Date());
  guardar(prev.map((t,i)=>{
    const dia=parseFecha(t.fecha||hoy).getDay();
    const dias=Array.isArray(t.diasSemana)&&t.diasSemana.length?t.diasSemana:[dia];
    const turno=normalizarTurnoPermitido(t.turnoPermitido||t.turno);
    const asignaciones={};
    if(t.responsables){
      const fecha=t.fecha||hoy;
      asignaciones[fecha]={[turno==="tarde"?"tarde":"manana"]:{responsables:String(t.responsables).split(",").map(x=>x.trim()).filter(Boolean),estado:t.estado==="completada"?"completada":"pendiente",completadaPor:t.completadaPor||"",completadaHora:t.completadaHora||""}};
    }
    return {id:t.id||crypto.randomUUID?.()||String(Date.now()+i),nombre:t.nombre||"Tarea",descripcion:t.descripcion||"",sector:t.sector||"General",duracionMin:parseInt(t.duracion)||10,diasSemana:dias,turnoPermitido:turno,activo:t.activo!==false,asignaciones};
  }));
}
function seed(){
  migrar();
  if(!leer().length) guardar([]);
  if(!localStorage.getItem(BANO_KEY)) guardarJSON(BANO_KEY,{participantes:[],fechaAncla:iso(new Date())});
  else {
    const cfg=leerJSON(BANO_KEY,{});
    guardarJSON(BANO_KEY,{participantes:Array.isArray(cfg.participantes)?cfg.participantes:[],fechaAncla:cfg.fechaAncla||cfg.fechaInicio||iso(new Date())});
  }
}

function correspondeDia(t,fecha){ return t.activo!==false; }
function turnosPermitidos(t){ return ["manana","tarde"]; }
function asignacion(t,fecha,turno){ return t.asignaciones?.[fecha]?.[turno]||null; }
function asignacionesDelDia(){
 const fecha=iso(fechaSeleccionada), out=[];
 leer().filter(t=>(t.sector||"General")===sectorSeleccionado).forEach(t=>{
   for(const turno of turnosPermitidos(t)){
     const a=asignacion(t,fecha,turno); if(a) out.push({...t,_turno:turno,_asignacion:a,estado:a.estado||"pendiente",_canManage:puedeAsignar()});
   }
 }); return out;
}
function tareasDisponibles(){ const fecha=iso(fechaSeleccionada); return leer().filter(t=>(t.sector||"General")===sectorSeleccionado && t.activo!==false && ["manana","tarde"].some(turno=>!asignacion(t,fecha,turno))); }
function colorTurno(t){ return t==="manana"?"turno-manana":"turno-tarde"; }
function renderDias(){ const box=$("tareasDias"); if(!box)return; box.innerHTML=""; for(let i=0;i<7;i++){const d=new Date(semanaBase);d.setDate(d.getDate()+i);const b=document.createElement("button");b.type="button";b.className=[iso(d)===iso(fechaSeleccionada)?"activo":"",iso(d)===iso(new Date())?"hoy":""].filter(Boolean).join(" ");b.innerHTML=`<strong>${DIAS[d.getDay()]}</strong><span>${d.getDate()}</span>`;b.onclick=()=>{fechaSeleccionada=d;renderTareas();};box.appendChild(b);} }
function renderResumen(){ const box=$("tareasResumen"); if(box){box.innerHTML="";box.classList.add("oculto");} }
function renderLista(items){
  const box=$("tareasLista");
  if(!items.length){box.innerHTML=emptyTaskListTemplate();return;}
  const unicas=[...new Map(items.map(t=>[`${t.id}::${t._turno}`,t])).values()];
  const manana=unicas.filter(t=>t._turno==="manana"),tarde=unicas.filter(t=>t._turno==="tarde");
  box.innerHTML=shiftSectionTemplate("manana",manana)+shiftSectionTemplate("tarde",tarde);
}
function renderTareas(){ normalizarSector(); const items=asignacionesDelDia(); $("tareasSectorNombre").textContent=sectorSeleccionado; const puedeCambiarSector=sectoresPermitidos().length>1; $("btnTareasCambiarSector").disabled=!puedeCambiarSector; $("btnTareasCambiarSector").classList.toggle("sector-unico",!puedeCambiarSector); $("btnTareasSemanaActual").textContent=`${fmt(semanaBase,{day:"2-digit",month:"short"})} - ${fmt(new Date(semanaBase.getFullYear(),semanaBase.getMonth(),semanaBase.getDate()+6),{day:"2-digit",month:"short"})}`; $("tareasFechaTitulo").textContent=fmt(fechaSeleccionada,{weekday:"long",day:"numeric",month:"long"}).toUpperCase(); $("btnNuevaTarea").textContent="+ Asignar tarea"; $("btnNuevaTarea").classList.toggle("oculto",!puedeAsignar()); renderDias();renderResumen(items);renderLista(items); }
async function cambiarEstado(id,turno){
  const all=leer(),t=all.find(x=>x.id===id),fecha=iso(fechaSeleccionada),a=t?.asignaciones?.[fecha]?.[turno];
  if(!a||a.estado==="completada")return;
  const ok=await window.AutoservicioDialog?.confirm?.({title:"Completar tarea",message:`¿Marcar “${t.nombre}” como completada?`,confirmText:"Completar"});
  if(ok===false)return;
  try{
    const r=await fetch(`${API_BASE_URL}/tareas/completar`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,fecha,turno})});
    const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.mensaje||"No se pudo completar la tarea");
    Object.assign(a,data.asignacion||{});guardarLocal(all);renderTareas();
  }catch(error){window.AutoservicioDialog?.alert?.({title:"No se pudo completar",message:error.message||"Intentá nuevamente."});}
}

function abrir(t=null){
  tareaEditando=t; normalizarSector();
  $("tareaModalTitulo").textContent=t?"Editar tarea":"Nueva tarea";
  $("tareaNombre").value=t?.nombre||"";
  establecerDuracionSelector(t?.duracionMin||10);
  $("tareaModalAdminActions").classList.toggle("oculto",!t); if(t)$("btnAlternarTarea").textContent=t.activo===false?"Activar tarea":"Desactivar tarea";
  $("tareaModal").classList.remove("oculto"); $("tareaModal").setAttribute("aria-hidden","false");
}
function cerrar(){ $("tareaModal").classList.add("oculto"); $("tareaModal").setAttribute("aria-hidden","true"); tareaEditando=null; }
function guardarForm(){
  const nombre=$("tareaNombre").value.trim(),duracionMin=duracionDesdeInput($("tareaDuracion").value);
  if(!nombre){window.AutoservicioDialog?.alert?.({title:"Falta el nombre",message:"Escribí el nombre de la tarea."});return;}
  if(!Number.isFinite(duracionMin)||duracionMin<1){window.AutoservicioDialog?.alert?.({title:"Duración inválida",message:"Seleccioná una duración mayor a cero."});return;}
  const all=leer();
  if(tareaEditando){ const actual=all.find(x=>x.id===tareaEditando.id); Object.assign(actual,{nombre,duracionMin,sector:sectorSeleccionado}); }
  else all.push({id:crypto.randomUUID?.()||String(Date.now()),nombre,descripcion:"",sector:sectorSeleccionado,duracionMin,diasSemana:[],turnoPermitido:"ambos",activo:true,asignaciones:{}});
  guardar(all); cerrar(); renderTareas(); renderConfig();
}
async function eliminarTareaActual(){ if(!tareaEditando)return; const id=tareaEditando.id; const ok=await window.AutoservicioDialog?.confirm?.({title:"Eliminar tarea",message:`¿Eliminar “${tareaEditando.nombre}”?`,confirmText:"Eliminar",danger:true});if(ok===false)return;guardar(leer().filter(x=>x.id!==id),{deletedIds:[id]});cerrar();renderTareas();renderConfig(); }
async function confirmarEliminar(t){ const ok=await window.AutoservicioDialog?.confirm?.({title:"Eliminar tarea",message:`¿Eliminar “${t.nombre}”?`,confirmText:"Eliminar",danger:true});if(ok===false)return;guardar(leer().filter(x=>x.id!==t.id),{deletedIds:[t.id]});renderConfig();renderTareas(); }

async function cargarUsuariosTareas(){ try{const r=await fetch(`${API_BASE_URL}/tareas/usuarios`),data=await r.json();if(r.ok&&data.ok)usuariosTareas=data.usuarios||[];}catch{} if(!usuariosTareas.length){const u=usuario();usuariosTareas=u.nombre?[{usuario:u.usuario||u.nombre,nombre:u.nombre,sector:u.sector||""}]:[];} }
function normalClave(v){return String(v||"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function usuariosDelSector(){ return usuariosTareas.filter(u=>!u.sector||normalClave(u.sector)===normalClave(sectorSeleccionado)||(u.sectores||[]).some(s=>normalClave(s)===normalClave(sectorSeleccionado))); }
function mesCalendario(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}
function minutos(h){const [a,b]=String(h||"").split(":").map(Number);return Number.isFinite(a)&&Number.isFinite(b)?a*60+b:null;}
function intervalosTurno(def){ if(!def)return[]; const out=[[minutos(def.inicio),minutos(def.fin)]]; if(def.tipo==="cortado")out.push([minutos(def.inicio2),minutos(def.fin2)]); return out.filter(x=>x[0]!==null&&x[1]!==null); }
function coincideFranja(def,franja){
  // Mañana termina y tarde comienza a las 15:00. La intersección debe ser
  // positiva: quien termina exactamente a las 15:00 no trabaja por la tarde.
  const rangos={manana:[0,15*60],tarde:[15*60,24*60]};
  const objetivo=rangos[franja];
  if(!objetivo)return false;
  return intervalosTurno(def).some(([ini,fin])=>ini<objetivo[1]&&fin>objetivo[0]);
}
function horarioTexto(def){return intervalosTurno(def).map(([a,b])=>`${String(Math.floor(a/60)).padStart(2,"0")}:${String(a%60).padStart(2,"0")}–${String(Math.floor(b/60)).padStart(2,"0")}:${String(b%60).padStart(2,"0")}`).join(" / ");}
async function usuariosDisponiblesCalendario(turno){
  try{
    const rc=await fetch(`${API_BASE_URL}/horarios/contexto`),ctx=await rc.json(); if(!rc.ok||!ctx.ok)throw new Error();
    const sec=(ctx.sectores||[]).find(x=>normalClave(x.id)===normalClave(sectorSeleccionado)||normalClave(x.nombre)===normalClave(sectorSeleccionado)); if(!sec)return[];
    const rr=await fetch(`${API_BASE_URL}/horarios/calendario?sector=${encodeURIComponent(sec.id)}&mes=${mesCalendario(fechaSeleccionada)}`),cal=await rr.json(); if(!rr.ok||!cal.ok)throw new Error();
    const dia=fechaSeleccionada.getDate(),defs=new Map((cal.turnos||[]).map(x=>[x.id,x]));
    const celdas=(cal.celdas||[]).filter(x=>Number(x.dia)===dia);
    const especiales=new Set(["franco","vacaciones","ausente","licencia"]);
    return celdas.map(c=>({celda:c,def:defs.get(c.turno)})).filter(x=>x.def&&!especiales.has(normalClave(x.celda.turno))&&coincideFranja(x.def,turno)).map(x=>{
      const info=(sec.empleadosInfo||[]).find(i=>normalClave(i.nombre)===normalClave(x.celda.empleado));
      return {usuario:info?.usuario||x.celda.empleado,nombre:x.celda.empleado,horario:horarioTexto(x.def)};
    });
  }catch{return[];}
}
function sincronizarEstadoSeleccionAsignacion(){
  document.querySelectorAll('#asignarUsuarios input').forEach(input=>{input.checked=normalClave(input.value)===normalClave(asignarUsuarioSeleccionado);});
  document.querySelectorAll('#asignarTareasLista input').forEach(input=>{input.checked=asignarTareasSeleccionadas.has(input.value);});
}
function actualizarEstadoGuardarAsignacion(){
  const boton=$("btnGuardarAsignar");
  if(!boton)return;
  const valido=Boolean(asignarUsuarioSeleccionado && asignarTareasSeleccionadas.size && $("asignarTurno")?.value);
  boton.disabled=!valido; boton.setAttribute("aria-disabled",String(!valido));
}
function actualizarCantidadResponsables(){
  $("asignarResponsablesCantidad").textContent=asignarUsuarioSeleccionado?"1 seleccionado":"0 seleccionados";
  actualizarEstadoGuardarAsignacion();
}
async function renderResponsablesAsignacion(){
  const pedido=++solicitudResponsables, box=$("asignarUsuarios"),turno=$("asignarTurno").value;
  box.innerHTML='<div class="tareas-empty assign-loading">Consultando el calendario…</div>';
  $("asignarResponsablesCantidad").textContent="0 seleccionados";
  let lista=await usuariosDisponiblesCalendario(turno); if(pedido!==solicitudResponsables)return;
  const unicos=new Map(); for(const item of lista){const clave=normalClave(item.usuario||item.nombre);if(clave&&!unicos.has(clave))unicos.set(clave,item);} lista=[...unicos.values()];
  if(!lista.length) box.innerHTML='<div class="tareas-empty assign-empty"><strong>Sin usuarios disponibles</strong><span>No hay personas de este sector trabajando en este día y turno.</span></div>';
  else box.innerHTML=lista.map(u=>`<label class="assign-user-card"><input type="radio" name="asignarUsuarioRadio" value="${esc(u.nombre)}" ${normalClave(u.nombre)===normalClave(asignarUsuarioSeleccionado)?"checked":""}><span class="assign-user-check"><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span><span class="assign-user-copy"><strong>${esc(u.nombre)}</strong><small>${esc(u.horario)}</small></span></label>`).join("");
  sincronizarEstadoSeleccionAsignacion(); actualizarCantidadResponsables();
}
function renderTareasAsignables(){
  const q=normalClave($("asignarBuscarTarea").value), lista=asignarDisponibles.filter(t=>!q||normalClave(t.nombre).includes(q));
  $("asignarTareasCantidad").textContent=`${lista.length} disponible${lista.length===1?"":"s"}`;
  $("asignarTareasLista").innerHTML=lista.length?lista.map(t=>`<label class="assign-task-option"><input type="checkbox" value="${t.id}" ${asignarTareasSeleccionadas.has(t.id)?"checked":""}><span class="assign-task-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></span><span class="assign-task-copy"><strong>${esc(t.nombre)}</strong><small>${duracionTexto(t.duracionMin)}</small></span><span class="assign-task-mark"><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span></label>`).join(""):'<div class="tareas-empty assign-empty"><strong>Sin coincidencias</strong><span>Probá con otro nombre.</span></div>';
  sincronizarEstadoSeleccionAsignacion(); actualizarEstadoGuardarAsignacion();
}
function renderTurnosAsignacion(disponibles=["manana","tarde"],preferido=""){
  const input=$("asignarTurno"),botones=[...document.querySelectorAll("#asignarTurnoOpciones [data-turno]")],elegido=disponibles.includes(preferido)?preferido:(disponibles[0]||"");
  input.value=elegido; botones.forEach(btn=>{const ok=disponibles.includes(btn.dataset.turno);btn.disabled=!ok;btn.classList.toggle("is-active",ok&&btn.dataset.turno===elegido);btn.setAttribute("aria-checked",String(ok&&btn.dataset.turno===elegido));}); actualizarEstadoGuardarAsignacion();
}
function elegirTurnoAsignacion(turno){
  const btn=document.querySelector(`#asignarTurnoOpciones [data-turno="${turno}"]`);if(!btn||btn.disabled)return;
  $("asignarTurno").value=turno; document.querySelectorAll("#asignarTurnoOpciones [data-turno]").forEach(x=>{x.classList.toggle("is-active",x.dataset.turno===turno);x.setAttribute("aria-checked",String(x.dataset.turno===turno));}); renderResponsablesAsignacion();
}
async function abrirAsignar(){
  asignacionEditando=null; asignarUsuarioSeleccionado=""; asignarTareasSeleccionadas.clear(); await cargarUsuariosTareas(); asignarDisponibles=leer().filter(t=>(t.sector||"General")===sectorSeleccionado&&t.activo!==false);
  if(!asignarDisponibles.length){window.AutoservicioDialog?.alert?.({title:"Sin tareas disponibles",message:"No hay tareas activas configuradas para este sector."});return;}
  $("asignarFechaTexto").textContent=fmt(fechaSeleccionada,{weekday:"long",day:"numeric",month:"long"}); $("asignarBuscarTarea").value=""; renderTareasAsignables(); renderTurnosAsignacion(["manana","tarde"],"manana"); await renderResponsablesAsignacion();
  $("asignarModalTitulo").textContent="Asignar tareas por usuario"; $("btnGuardarAsignar").textContent="Asignar tareas";
  $("asignarModal").classList.remove("oculto");$("asignarModal").setAttribute("aria-hidden","false");
}
function cerrarAsignar(){ asignacionEditando=null; asignarUsuarioSeleccionado=""; asignarTareasSeleccionadas.clear(); solicitudResponsables++; $("asignarModal").classList.add("oculto");$("asignarModal").setAttribute("aria-hidden","true"); $("btnGuardarAsignar").disabled=true; }
async function guardarAsignacion(){
  const turno=$("asignarTurno").value, responsable=asignarUsuarioSeleccionado.trim(), ids=[...asignarTareasSeleccionadas], fecha=iso(fechaSeleccionada);
  if(!turno||!responsable||!ids.length){window.AutoservicioDialog?.alert?.({title:"Faltan datos",message:"Seleccioná un usuario, el turno y al menos una tarea."});return;}
  const boton=$("btnGuardarAsignar"); boton.disabled=true; boton.textContent="Guardando…";
  try{
    const r=await fetch(`${API_BASE_URL}/tareas/asignaciones-lote`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids,fecha,turno,responsable})}),data=await r.json(); if(!r.ok||!data.ok)throw new Error(data.mensaje||"No se pudieron guardar las tareas");
    await cargarTareasRemotas(); cerrarAsignar(); renderTareas();
  }catch(error){window.AutoservicioDialog?.alert?.({title:"No se pudo asignar",message:error.message||"Intentá nuevamente."}); boton.disabled=false; boton.textContent="Asignar tareas";}
}
async function abrirEditarAsignacion(id,turno){
  const fecha=iso(fechaSeleccionada),t=leer().find(x=>x.id===id),a=t?.asignaciones?.[fecha]?.[turno];if(!t||!a)return;
  asignacionEditando={id,fecha,turno,estado:a.estado||"pendiente"};await cargarUsuariosTareas();asignarDisponibles=[t];$("asignarFechaTexto").textContent=fmt(fechaSeleccionada,{weekday:"long",day:"numeric",month:"long"});$("asignarBuscarTarea").value="";$("asignarTareaSelect").innerHTML=`<option value="${esc(t.id)}">${esc(t.nombre)}</option>`;$("asignarTareaSelect").value=t.id;renderTareasAsignables();$("asignarModal").classList.remove("oculto");$("asignarModal").setAttribute("aria-hidden","false");const turnos=["manana","tarde"].filter(x=>x===turno||!asignacion(t,fecha,x));renderTurnosAsignacion(turnos,turno);await renderResponsablesAsignacion();
  const responsables=(a.responsables||[]); asignarUsuarioSeleccionado=responsables[0]||""; asignarTareasSeleccionadas=new Set([t.id]); sincronizarEstadoSeleccionAsignacion(); actualizarCantidadResponsables();$("btnGuardarAsignar").textContent="Guardar cambios";
}
async function eliminarAsignacion(id,turno){
  const t=leer().find(x=>x.id===id),fecha=iso(fechaSeleccionada);if(!t?.asignaciones?.[fecha]?.[turno])return;
  const ok=await window.AutoservicioDialog?.confirm?.({title:"Eliminar asignación",message:`¿Eliminar la asignación de “${t.nombre}” para ${TURNOS[turno].toLowerCase()}?`,confirmText:"Eliminar",danger:true});if(ok===false)return;
  try{const r=await fetch(`${API_BASE_URL}/tareas/asignacion`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,fecha,turno})}),data=await r.json();if(!r.ok||!data.ok)throw new Error(data.mensaje||"No se pudo eliminar");delete t.asignaciones[fecha][turno];if(!Object.keys(t.asignaciones[fecha]).length)delete t.asignaciones[fecha];guardarLocal(leer());renderTareas();}
  catch(error){window.AutoservicioDialog?.alert?.({title:"No se pudo eliminar",message:error.message||"Intentá nuevamente."});}
}

function configBano(){
  const cfg=banoMemoria||leerJSON(BANO_KEY,{participantes:[],fechaAncla:iso(new Date()),historial:[]});
  return {participantes:Array.isArray(cfg.participantes)?cfg.participantes:[],fechaAncla:cfg.fechaAncla||cfg.fechaInicio||iso(new Date()),historial:Array.isArray(cfg.historial)?cfg.historial:[]};
}
async function cargarBanoRemoto(){
  try{
    const r=await fetch(`${API_BASE_URL}/tareas/bano`),data=await r.json();
    if(!r.ok||!data.ok)throw new Error(data.mensaje||"No se pudo cargar la rotación");
    banoMemoria=data.config||{}; guardarJSON(BANO_KEY,banoMemoria); guardarJSON(BANO_HISTORY_KEY,banoMemoria.historial||[]);
  }catch{banoMemoria=leerJSON(BANO_KEY,{participantes:[],fechaAncla:iso(new Date()),historial:leerJSON(BANO_HISTORY_KEY,[])});}
}
function claveParticipante(valor){
  if(valor&&typeof valor==="object") return String(valor.usuario||valor.nombre||"");
  return String(valor||"");
}
function usuarioParticipante(clave){
  return usuariosTareas.find(u=>u.usuario===clave)||usuariosTareas.find(u=>(u.nombre||u.usuario)===clave)||null;
}
function nombreParticipante(clave){ const u=usuarioParticipante(clave); return u?.nombre||u?.usuario||clave||"Sin participantes"; }
function esDiaLimpieza(fecha,cfg){
  const dias=Math.floor((inicioDia(fecha)-parseFecha(cfg.fechaAncla))/86400000);
  return ((dias%2)+2)%2===0;
}
function indiceBano(fecha,cfg){
  if(!cfg.participantes.length||!esDiaLimpieza(fecha,cfg))return -1;
  const dias=Math.floor((inicioDia(fecha)-parseFecha(cfg.fechaAncla))/86400000);
  const turno=Math.floor(dias/2);
  return ((turno%cfg.participantes.length)+cfg.participantes.length)%cfg.participantes.length;
}
function responsableBano(fecha,cfg){ const i=indiceBano(fecha,cfg); return i<0?"":nombreParticipante(claveParticipante(cfg.participantes[i])); }
function renderBano(){
  const cfg=configBano(), hoy=inicioDia(new Date()), corresponde=esDiaLimpieza(hoy,cfg), responsable=responsableBano(hoy,cfg), hist=cfg.historial||[];
  const confirmado=corresponde?hist.find(h=>h.fecha===iso(hoy)):null;
  const sinParticipantes=!cfg.participantes.length;
  const inicial=responsable?responsable.charAt(0).toUpperCase():"—";
  const estadoTexto=!corresponde?"Descanso":confirmado?"Completada":"Pendiente";
  const estadoClase=!corresponde?"is-rest":confirmado?"is-done":"is-pending";
  $("banoTurnoActual").innerHTML=`
    <div class="bano-hero-head">
      <div><span class="bano-eyebrow">${corresponde?"RESPONSABLE DE HOY":"HOY NO CORRESPONDE"}</span><strong>${fmt(hoy,{weekday:"long",day:"numeric",month:"long"})}</strong></div>
      <span class="bano-status-pill ${estadoClase}">${estadoTexto}</span>
    </div>
    <div class="bano-hero-person ${!corresponde?"is-rest-day":""}">
      <div class="bano-avatar">${esc(inicial)}</div>
      <div class="bano-person-copy">${corresponde?`<small>Le corresponde a</small><h3>${esc(responsable||"Sin participantes")}</h3><p>Limpieza día por medio</p>`:`<small>Próxima limpieza</small><h3>Día de descanso</h3><p>La limpieza se realiza un día sí y otro no.</p>`}</div>
    </div>
    ${!corresponde?`<div class="bano-rest-note"><strong>No hay limpieza asignada para hoy</strong><span>La rotación continuará automáticamente en el próximo día correspondiente.</span></div>`:confirmado?`<div class="bano-confirmed"><svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><div><strong>Limpieza confirmada</strong><span>${esc(confirmado.hora)} · ${esc(confirmado.usuario)}</span></div></div>`:`<button id="btnConfirmarBano" class="bano-confirm-btn" type="button" ${sinParticipantes?"disabled":""}><svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>Confirmar limpieza</button>`}`;
  const proximos=[];
  for(let i=1,offset=1;proximos.length<5&&offset<20;offset++){
    const d=new Date(hoy); d.setDate(d.getDate()+offset);
    if(esDiaLimpieza(d,cfg)) proximos.push({fecha:d,nombre:responsableBano(d,cfg),orden:i++});
  }
  $("banoProximos").innerHTML=cfg.participantes.length?proximos.map(x=>`<article class="bano-turn-card"><div class="bano-turn-date"><strong>${x.fecha.getDate()}</strong><span>${fmt(x.fecha,{month:"short"}).replace('.','')}</span></div><div class="bano-turn-copy"><small>Próximo turno ${x.orden}</small><strong>${esc(x.nombre)}</strong><span>${fmt(x.fecha,{weekday:"long"})}</span></div><svg class="app-icon bano-turn-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></article>`).join(""):'<div class="tareas-empty"><strong>Sin participantes</strong><span>Seleccioná usuarios desde Configuración.</span></div>';
  $("banoHistorial").innerHTML=hist.length?hist.slice().reverse().slice(0,5).map(h=>`<article class="bano-history-card"><span class="bano-history-check"><svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></span><div><strong>${esc(h.usuario)}</strong><span>${fmt(parseFecha(h.fecha),{weekday:"long",day:"numeric",month:"long"})}</span></div><time>${esc(h.hora)}</time></article>`).join(""):'<div class="tareas-empty bano-empty-history"><span class="tareas-empty-icon"><svg class="app-icon" viewBox="0 0 24 24"><path d="M12 8v5l3 2"/><circle cx="12" cy="12" r="9"/></svg></span><strong>Sin confirmaciones</strong><span>Las limpiezas confirmadas aparecerán acá.</span></div>';
  $("btnConfirmarBano")?.addEventListener("click",confirmarBano);
}
async function confirmarBano(){
  const hoyFecha=new Date(),hoy=iso(hoyFecha),cfg=configBano();
  if(!esDiaLimpieza(hoyFecha,cfg)||(cfg.historial||[]).some(h=>h.fecha===hoy))return;
  const boton=$("btnConfirmarBano"); if(boton){boton.disabled=true;boton.textContent="Confirmando...";}
  try{const r=await fetch(`${API_BASE_URL}/tareas/bano/confirmar`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fecha:hoy})}),data=await r.json();if(!r.ok||!data.ok)throw new Error(data.mensaje||"No se pudo confirmar");banoMemoria=data.config;guardarJSON(BANO_KEY,banoMemoria);guardarJSON(BANO_HISTORY_KEY,banoMemoria.historial||[]);renderBano();}
  catch(error){window.AutoservicioDialog?.alert?.({title:"No se pudo confirmar",message:error.message||"Intentá nuevamente."});if(boton)boton.disabled=false;}
}
function participantesConfigActuales(){
  return [...document.querySelectorAll("#banoUsuariosDisponibles input:checked")].map(x=>x.value).filter(Boolean);
}
function renderParticipantesConfig(seleccionados){
  const marcados=new Set((seleccionados||[]).map(claveParticipante));
  $("banoParticipantesCantidad").textContent=String(marcados.size);
  // La configuración resumida muestra únicamente la cantidad. Los nombres
  // permanecen disponibles dentro del selector, evitando una cabecera saturada.
  $("banoParticipantesSeleccionados").innerHTML="";
  const q=normalClave($("banoBuscarUsuario")?.value||"");
  const lista=usuariosTareas.filter(u=>!q||normalClave(`${u.nombre||""} ${u.usuario||""} ${u.sector||""}`).includes(q));
  $("banoUsuariosDisponibles").innerHTML=lista.length?lista.map(u=>{
    const clave=claveParticipante(u),marcado=marcados.has(clave);
    return `<label class="config-user-option"><input type="checkbox" value="${esc(clave)}" ${marcado?"checked":""}><span class="config-user-check"><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span><span class="config-user-copy"><strong>${esc(u.nombre||u.usuario)}</strong><small>${esc(u.sector||"Sin sector")}</small></span></label>`;
  }).join(""):'<div class="config-participants-empty"><strong>Sin coincidencias</strong><span>Probá con otra búsqueda.</span></div>';
}
async function guardarConfigBano(){
  const anterior=configBano(),participantes=participantesConfigActuales(),boton=$("btnGuardarConfigBano");
  if(boton){boton.disabled=true;boton.dataset.textoOriginal=boton.textContent;boton.textContent="Guardando...";}
  try{const r=await fetch(`${API_BASE_URL}/tareas/bano`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({participantes,fechaAncla:anterior.fechaAncla||iso(new Date())})}),data=await r.json();if(!r.ok||!data.ok)throw new Error(data.mensaje||"No se pudo guardar");banoMemoria=data.config;guardarJSON(BANO_KEY,banoMemoria);guardarJSON(BANO_HISTORY_KEY,banoMemoria.historial||[]);renderParticipantesConfig(banoMemoria.participantes);$("banoSelectorParticipantes")?.classList.add("oculto");renderBano();window.AutoservicioDialog?.alert?.({title:"Configuración guardada",message:"La rotación quedó disponible para todos los usuarios y dispositivos."});}
  catch(error){window.AutoservicioDialog?.alert?.({title:"No se pudo guardar",message:error.message||"Intentá nuevamente."});}
  finally{if(boton){boton.disabled=false;boton.textContent=boton.dataset.textoOriginal||"Guardar configuración";}}
}

async function cambiarSectorConfig(){
  const sectores=sectoresPermitidos(), actual=$("configSectorFiltro").value||sectorSeleccionado||sectores[0]||"General";
  let elegido="";
  if(window.AppChoicePicker?.open) elegido=await window.AppChoicePicker.open({title:"Seleccionar sector",kicker:"Configuración de tareas",value:actual,options:sectores.map(s=>({value:s,label:s}))});
  else elegido=prompt("Sector",actual)||"";
  if(elegido&&sectores.includes(elegido)){ $("configSectorFiltro").value=elegido; sectorSeleccionado=elegido; renderConfig(); }
}
function renderConfig(){
  const permiso=puedeConfigurar(); $("tareasConfigSinPermiso").classList.toggle("oculto",permiso); $("tareasConfigContenido").classList.toggle("oculto",!permiso); if(!permiso)return;
  const sectores=sectoresPermitidos(),sel=$("configSectorFiltro"),actual=sel.value||sectorSeleccionado||sectores[0]||"General"; sel.innerHTML=sectores.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");sel.value=sectores.includes(actual)?actual:(sectores[0]||"");sectorSeleccionado=sel.value||sectorSeleccionado;$("configSectorNombre").textContent=sel.value||"General";
  const todas=leer().filter(t=>(t.sector||"General")===sel.value), q=normalClave($("configBuscarTarea")?.value||""), lista=todas.filter(t=>!q||normalClave(t.nombre).includes(q)),activas=todas.filter(t=>t.activo!==false).length;
  $("btnLimpiarBusquedaTarea").classList.toggle("oculto",!q);
  $("configTareasResumen").innerHTML=`<div><small>Total</small><strong>${todas.length}</strong></div><div><small>Activas</small><strong>${activas}</strong></div><div><small>Desactivadas</small><strong>${todas.length-activas}</strong></div>`;
  $("configTareasLista").innerHTML=lista.length?lista.map(t=>`<article class="config-task-row ${t.activo===false?"is-disabled":""}" data-id="${t.id}" tabindex="0"><span class="config-task-icon"><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span><div class="config-task-copy"><strong>${esc(t.nombre)}</strong><p>${duracionTexto(t.duracionMin)}${t.activo===false?' · Desactivada':''}</p></div><button type="button" class="config-task-open" data-config-action="edit" aria-label="Editar ${esc(t.nombre)}"><svg class="app-icon" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button></article>`).join(""):`<div class="tareas-empty config-tasks-empty"><strong>${q?"Sin coincidencias":"Sin tareas configuradas"}</strong><span>${q?"Probá con otro nombre.":`Agregá la primera tarea de ${esc(sel.value||"este sector")}.`}</span></div>`;
  const cfg=configBano();renderParticipantesConfig(cfg.participantes); actualizarConfigSubvista();
}
function actualizarConfigSubvista(){
  const tareas=configSubvista==="tareas";
  $("configPanelTareas").classList.toggle("oculto",!tareas); $("configPanelBano").classList.toggle("oculto",tareas);
  $("btnConfigTabTareas").classList.toggle("activo",tareas); $("btnConfigTabBano").classList.toggle("activo",!tareas);
  $("btnConfigTabTareas").setAttribute("aria-selected",tareas?"true":"false"); $("btnConfigTabBano").setAttribute("aria-selected",tareas?"false":"true");
}

async function cambiarSector(){ const opts=sectoresPermitidos().map(s=>({value:s,label:s})); if(window.AppChoicePicker?.open){const v=await window.AppChoicePicker.open({title:"Seleccionar sector",kicker:"Tareas",value:sectorSeleccionado,options:opts});if(v){sectorSeleccionado=v;renderTareas();}} else { const v=prompt("Sector",sectorSeleccionado); if(v){sectorSeleccionado=v;renderTareas();} } }
function cambiarVista(v){ vistaActual=v; document.body.dataset.tareasVista=v; document.querySelectorAll("[data-tareas-view]").forEach(x=>{const visible=x.dataset.tareasView===v;x.classList.toggle("oculto",!visible);x.setAttribute("aria-hidden",visible?"false":"true");}); document.querySelectorAll("[data-tareas-tab]").forEach(x=>{const activo=x.dataset.tareasTab===v;x.classList.toggle("activo",activo);x.setAttribute("aria-current",activo?"page":"false");}); if(v==="tareas")renderTareas(); if(v==="bano")renderBano(); if(v==="config")renderConfig(); requestAnimationFrame(()=>window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})); }

function bind(){
  prepararSelectorDuracion();
  $("btnTareasSemanaAnterior").onclick=()=>{semanaBase.setDate(semanaBase.getDate()-7);fechaSeleccionada=new Date(semanaBase);renderTareas();};
  $("btnTareasSemanaSiguiente").onclick=()=>{semanaBase.setDate(semanaBase.getDate()+7);fechaSeleccionada=new Date(semanaBase);renderTareas();};
  $("btnTareasSemanaActual").onclick=()=>{fechaSeleccionada=inicioDia(new Date());semanaBase=inicioSemana(fechaSeleccionada);renderTareas();};
  $("btnTareasCambiarSector").onclick=cambiarSector;$("btnNuevaTarea").onclick=abrirAsignar;$("btnConfigNuevaTarea").onclick=()=>{sectorSeleccionado=$("configSectorFiltro").value||sectorSeleccionado;abrir();};
  $("btnCerrarTareaModal").onclick=$("btnCancelarTarea").onclick=cerrar;$("btnGuardarTarea").onclick=guardarForm;$("btnEliminarTarea").onclick=eliminarTareaActual;$("btnAlternarTarea").onclick=async()=>{if(!tareaEditando)return;const all=leer(),t=all.find(x=>x.id===tareaEditando.id);if(!t)return;const vaAActivar=t.activo===false;if(!vaAActivar){const ok=await window.AutoservicioDialog?.confirm?.({title:"Desactivar tarea",message:`¿Desactivar “${t.nombre}”? Ya no aparecerá entre las tareas disponibles para asignar.`,confirmText:"Desactivar",danger:true});if(ok===false)return;}t.activo=vaAActivar;guardar(all);cerrar();renderConfig();renderTareas();};$("tareaModal").onclick=e=>{if(e.target.id==="tareaModal")cerrar();};
  $("btnCerrarAsignarModal").onclick=$("btnCancelarAsignar").onclick=cerrarAsignar;$("btnGuardarAsignar").onclick=guardarAsignacion;document.querySelectorAll("#asignarTurnoOpciones [data-turno]").forEach(btn=>btn.onclick=()=>elegirTurnoAsignacion(btn.dataset.turno));$("asignarBuscarTarea").oninput=renderTareasAsignables;
  $("asignarTareasLista").onchange=e=>{const input=e.target.closest('input[type="checkbox"]');if(input){input.checked?asignarTareasSeleccionadas.add(input.value):asignarTareasSeleccionadas.delete(input.value);}actualizarEstadoGuardarAsignacion();};
  $("asignarUsuarios").onchange=e=>{const input=e.target.closest('input[type="radio"]');if(input)asignarUsuarioSeleccionado=input.value||"";sincronizarEstadoSeleccionAsignacion();actualizarCantidadResponsables();};$("asignarModal").onclick=e=>{if(e.target.id==="asignarModal")cerrarAsignar();};
  $("tareasLista").onclick=e=>{const row=e.target.closest(".tarea-item-row"),btn=e.target.closest("button[data-accion]");if(!row||!btn)return;const accion=btn.dataset.accion;if(accion==="completar")cambiarEstado(row.dataset.id,row.dataset.turno);if(accion==="editar")abrirEditarAsignacion(row.dataset.id,row.dataset.turno);if(accion==="eliminar")eliminarAsignacion(row.dataset.id,row.dataset.turno);};
  document.querySelectorAll("[data-tareas-tab]").forEach(b=>b.onclick=()=>cambiarVista(b.dataset.tareasTab));
  $("configSectorFiltro").onchange=renderConfig;$("btnConfigCambiarSector").onclick=cambiarSectorConfig;$("btnGuardarConfigBano").onclick=guardarConfigBano;$("configBuscarTarea").oninput=renderConfig;$("btnLimpiarBusquedaTarea").onclick=()=>{$("configBuscarTarea").value="";renderConfig();};$("btnConfigTabTareas").onclick=()=>{configSubvista="tareas";actualizarConfigSubvista();};$("btnConfigTabBano").onclick=()=>{configSubvista="bano";actualizarConfigSubvista();};$("btnElegirParticipantesBano").onclick=()=>{$("banoSelectorParticipantes").classList.toggle("oculto");};$("banoBuscarUsuario").oninput=()=>renderParticipantesConfig(participantesConfigActuales());
  $("banoUsuariosDisponibles").onchange=()=>renderParticipantesConfig(participantesConfigActuales());
  $("configTareasLista").onclick=e=>{const row=e.target.closest("[data-id]");if(!row)return;const t=leer().find(x=>x.id===row.dataset.id);if(t)abrir(t);};$("configTareasLista").onkeydown=e=>{if((e.key==="Enter"||e.key===" ")&&e.target.closest("[data-id]")){e.preventDefault();e.target.closest("[data-id]").click();}};
}
async function activar(){
  if(activacionTareasEnCurso)return activacionTareasEnCurso;
  activacionTareasEnCurso=(async()=>{
  activo=true;seed();
  sectorSeleccionado=sectorSeleccionado||sectorInicialUsuario();
  renderTareas();
  const tareasRemotas=cargarTareasRemotas().then(()=>{if(activo){normalizarSector();renderTareas();}});
  await Promise.all([cargarContextoTareas(),cargarUsuariosTareas(),cargarBanoRemoto()]);
  normalizarSector();
  if(activo)renderTareas();
  await tareasRemotas;
  const tieneConfig=puedeConfigurar();
  document.querySelector('[data-tareas-tab="config"]')?.classList.toggle("oculto",!tieneConfig);
  if(!tieneConfig&&vistaActual==="config")vistaActual="tareas";
  cambiarVista(vistaActual);
  })().finally(()=>{activacionTareasEnCurso=null;});
  return activacionTareasEnCurso;
}
function desactivar(){activo=false;cerrar();}
bind();window.TareasModule={activar,desactivar,mostrarBano:()=>cambiarVista("bano")};
