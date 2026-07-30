import { API_BASE_URL } from "./config.js?v=102-roles-permisos";

const $ = id => document.getElementById(id);
const KEY = "autoservicio_tareas_v3";
const OLD_KEYS = ["autoservicio_tareas_v2","autoservicio_tareas_v1"];
const BANO_KEY = "autoservicio_bano_config_v1";
const BANO_HISTORY_KEY = "autoservicio_bano_historial_v1";
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

function inicioDia(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function inicioSemana(d){ const x=inicioDia(d), day=x.getDay(); x.setDate(x.getDate()-(day===0?6:day-1)); return x; }
function iso(d){ const x=inicioDia(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; }
function parseFecha(v){ const [y,m,d]=String(v||"").split("-").map(Number); return y?new Date(y,m-1,d):inicioDia(new Date()); }
function fmt(d,opt={}){ return new Intl.DateTimeFormat("es-AR",opt).format(d); }
function esc(v){const d=document.createElement("div");d.textContent=v??"";return d.innerHTML;}
function leerJSON(key, fallback){ try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}catch{return fallback;} }
function guardarJSON(key,v){ localStorage.setItem(key,JSON.stringify(v)); }
function leer(){ return tareasMemoria.length || localStorage.getItem(KEY) ? tareasMemoria : leerJSON(KEY,[]); }
function guardarLocal(v){ tareasMemoria=Array.isArray(v)?v:[]; guardarJSON(KEY,tareasMemoria); }
async function sincronizarTareas(v){
  if(!["administrador","supervisor"].includes(usuario()?.rol)) return;
  guardadoRemotoEnCurso=guardadoRemotoEnCurso.then(async()=>{
    const r=await fetch(`${API_BASE_URL}/tareas`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({tareas:v})});
    const data=await r.json(); if(!r.ok||!data.ok) throw new Error(data.mensaje||"No se pudieron sincronizar las tareas");
  }).catch(error=>window.AutoservicioDialog?.alert?.({title:"No se pudo sincronizar",message:error.message||"Revisá la conexión e intentá nuevamente."}));
  return guardadoRemotoEnCurso;
}
function guardar(v){ guardarLocal(v); void sincronizarTareas(v); }
async function cargarContextoTareas(){
  try{const r=await fetch(`${API_BASE_URL}/tareas/contexto`),data=await r.json();if(r.ok&&data.ok)contextoTareas=data;}catch{}
}
async function cargarTareasRemotas(){
  const locales=leerJSON(KEY,[]);
  try{
    const r=await fetch(`${API_BASE_URL}/tareas`),data=await r.json();
    if(!r.ok||!data.ok)throw new Error(data.mensaje||"No se pudieron cargar las tareas");
    tareasMemoria=Array.isArray(data.tareas)?data.tareas:[];
    // Primera migración: si el administrador todavía no tiene tareas en servidor, publica su base local.
    if(usuario()?.rol==="administrador"&&!tareasMemoria.length&&locales.length){guardarLocal(locales);await sincronizarTareas(locales);tareasMemoria=locales;}
    else guardarLocal(tareasMemoria);
  }catch{tareasMemoria=locales;}
}
function usuario(){ return window.AutoservicioAuth?.getUsuario?.() || {}; }
function puedeAsignar(){ return contextoTareas.puedeAsignar || ["administrador","supervisor"].includes(usuario()?.rol); }
function puedeConfigurar(){ return contextoTareas.puedeConfigurar || usuario()?.rol==="administrador"; }
function claveSector(v){ return String(v||"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es"); }
function sectoresUnicos(valores){ const mapa=new Map(); for(const valor of valores){ const limpio=String(valor||"").trim(); if(!limpio)continue; const clave=claveSector(limpio); if(!mapa.has(clave))mapa.set(clave,limpio); } return [...mapa.values()]; }
function sectoresUsuario(){ return sectoresUnicos((contextoTareas.sectores||[]).map(s=>s.nombre||s.id)); }
function todosLosSectores(){ const delContexto=sectoresUsuario(); const deTareas=leer().map(t=>t.sector).filter(Boolean); return sectoresUnicos([...delContexto,...deTareas]).sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"})); }
function sectoresPermitidos(){ return sectoresUsuario().length?sectoresUsuario():todosLosSectores(); }
function normalizarSector(){ const permitidos=sectoresPermitidos(); if(!sectorSeleccionado || !permitidos.includes(sectorSeleccionado)) sectorSeleccionado=permitidos[0]||"General"; }
function normalizarTurnoPermitido(v){ const x=String(v||"").toLowerCase(); if(x==="manana"||x==="tarde"||x==="ambos")return x; if(x.includes("15:00")||x.includes("tarde"))return "tarde"; return "manana"; }
function duracionTexto(v){ const n=Number(v); if(!Number.isFinite(n)||n<=0)return "Sin duración"; const h=Math.floor(n/60),m=n%60; return h&&m?`${h} h ${m} min`:h?`${h} h`:`${m} min`; }
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
     const a=asignacion(t,fecha,turno); if(a) out.push({...t,_turno:turno,_asignacion:a,estado:a.estado||"pendiente"});
   }
 }); return out;
}
function tareasDisponibles(){ const fecha=iso(fechaSeleccionada); return leer().filter(t=>(t.sector||"General")===sectorSeleccionado && t.activo!==false && ["manana","tarde"].some(turno=>!asignacion(t,fecha,turno))); }
function colorTurno(t){ return t==="manana"?"turno-manana":"turno-tarde"; }
function responsablesHTML(valor){ const nombres=Array.isArray(valor)?valor:String(valor||"").split(",").map(x=>x.trim()).filter(Boolean); if(!nombres.length)return '<span class="tarea-persona sin-responsable">Sin responsable</span>'; return nombres.map(nombre=>`<span class="tarea-persona"><svg class="app-icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M6 20c.4-4 2.4-6 6-6s5.6 2 6 6"/></svg>${esc(nombre)}</span>`).join(""); }

function renderDias(){ const box=$("tareasDias"); if(!box)return; box.innerHTML=""; for(let i=0;i<7;i++){const d=new Date(semanaBase);d.setDate(d.getDate()+i);const b=document.createElement("button");b.type="button";b.className=[iso(d)===iso(fechaSeleccionada)?"activo":"",iso(d)===iso(new Date())?"hoy":""].filter(Boolean).join(" ");b.innerHTML=`<strong>${DIAS[d.getDay()]}</strong><span>${d.getDate()}</span>`;b.onclick=()=>{fechaSeleccionada=d;renderTareas();};box.appendChild(b);} }
function renderResumen(items){ const n=s=>items.filter(t=>t.estado===s).length; $("tareasResumen").innerHTML=`<div><small>Total</small><strong>${items.length}</strong></div><div class="pend"><small>Pend.</small><strong>${n("pendiente")}</strong></div><div class="comp"><small>Comp.</small><strong>${n("completada")}</strong></div>`; }
function tareaCardHTML(t){
  const completada=t.estado==="completada";
  return `<article class="tarea-card tarea-card-v10" data-id="${t.id}" data-turno="${t._turno}">
    <div class="tarea-card-main">
      <div class="tarea-card-title">
        <h3>${esc(t.nombre)}</h3>
        <span class="tarea-duration-pill" aria-label="Duración: ${esc(duracionTexto(t.duracionMin))}">
          <svg class="app-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          ${duracionTexto(t.duracionMin)}
        </span>
      </div>
      <div class="tarea-info-grid">
        <div class="tarea-info-row tarea-info-sector"><span class="tarea-info-label">Sector</span><strong>${esc(t.sector||"General")}</strong></div>
        <div class="tarea-info-row tarea-info-responsables"><span class="tarea-info-label">Responsables</span><div class="tarea-assignment">${responsablesHTML(t._asignacion.responsables)}</div></div>
      </div>
    </div>
    <div class="tarea-card-state estado-${t.estado}">
      <strong><span class="estado-dot"></span>${completada?"COMPLETADA":"PENDIENTE"}</strong>
      ${completada?`<small>por ${esc(t._asignacion.completadaPor||"Usuario")}${t._asignacion.completadaHora?` · ${esc(t._asignacion.completadaHora)}`:""}</small>`:`<button type="button" data-accion="completar">Completar</button>`}
    </div>
  </article>`;
}
function renderGrupoTurno(turno,items){
  const esManana=turno==="manana",titulo=esManana?"Mañana":"Tarde";
  const icono=esManana
    ? '<svg class="app-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
    : '<svg class="app-icon" viewBox="0 0 24 24"><path d="M20 15.5A8.5 8.5 0 118.5 4 7 7 0 0020 15.5z"/></svg>';
  return `<section class="tareas-turno-group tareas-turno-${turno}">
    <header class="tareas-turno-head"><span class="tareas-turno-icon">${icono}</span><div><h3>${titulo}</h3><small>${items.length} ${items.length===1?"tarea":"tareas"}</small></div></header>
    <div class="tareas-turno-list">${items.length?items.map(tareaCardHTML).join(""):`<div class="tareas-turno-empty">Sin tareas para este turno</div>`}</div>
  </section>`;
}
function renderLista(items){
  const box=$("tareasLista");
  if(!items.length){box.innerHTML='<div class="tareas-empty tareas-empty-day"><span class="tareas-empty-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></span><strong>Sin tareas asignadas</strong><span>Usá “Asignar tarea” para organizar este día.</span></div>';return;}
  const manana=items.filter(t=>t._turno==="manana"),tarde=items.filter(t=>t._turno==="tarde");
  box.innerHTML=renderGrupoTurno("manana",manana)+renderGrupoTurno("tarde",tarde);
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
async function eliminarTareaActual(){ if(!tareaEditando)return; const ok=await window.AutoservicioDialog?.confirm?.({title:"Eliminar tarea",message:`¿Eliminar “${tareaEditando.nombre}”?`,confirmText:"Eliminar",danger:true});if(ok===false)return;guardar(leer().filter(x=>x.id!==tareaEditando.id));cerrar();renderTareas();renderConfig(); }
async function confirmarEliminar(t){ const ok=await window.AutoservicioDialog?.confirm?.({title:"Eliminar tarea",message:`¿Eliminar “${t.nombre}”?`,confirmText:"Eliminar",danger:true});if(ok===false)return;guardar(leer().filter(x=>x.id!==t.id));renderConfig();renderTareas(); }

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
function actualizarEstadoGuardarAsignacion(){
  const boton=$("btnGuardarAsignar");
  if(!boton)return;
  const valido=Boolean($("asignarTareaSelect")?.value && $("asignarTurno")?.value && document.querySelector("#asignarUsuarios input:checked"));
  boton.disabled=!valido;
  boton.setAttribute("aria-disabled",String(!valido));
}
function actualizarCantidadResponsables(){
  const n=document.querySelectorAll("#asignarUsuarios input:checked").length;
  $("asignarResponsablesCantidad").textContent=`${n} seleccionado${n===1?"":"s"}`;
  actualizarEstadoGuardarAsignacion();
}
async function renderResponsablesAsignacion(){
  const pedido=++solicitudResponsables;
  const box=$("asignarUsuarios"),turno=$("asignarTurno").value;
  box.innerHTML='<div class="tareas-empty assign-loading">Consultando el calendario…</div>';
  $("asignarResponsablesCantidad").textContent="0 seleccionados";
  let lista=await usuariosDisponiblesCalendario(turno);
  if(pedido!==solicitudResponsables)return;
  const unicos=new Map();
  for(const item of lista){const clave=normalClave(item.usuario||item.nombre);if(clave&&!unicos.has(clave))unicos.set(clave,item);}
  lista=[...unicos.values()];
  if(!lista.length) box.innerHTML='<div class="tareas-empty assign-empty"><strong>Sin usuarios disponibles</strong><span>No hay personas de este sector trabajando en este día y turno.</span></div>';
  else box.innerHTML=lista.map(u=>`<label class="assign-user-card"><input type="checkbox" value="${esc(u.nombre)}"><span class="assign-user-check"><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span><span class="assign-user-copy"><strong>${esc(u.nombre)}</strong><small>${esc(u.horario)}</small></span></label>`).join("");
}
function renderTareasAsignables(){
  const q=normalClave($("asignarBuscarTarea").value), lista=asignarDisponibles.filter(t=>!q||normalClave(t.nombre).includes(q));
  $("asignarTareasCantidad").textContent=`${lista.length} disponible${lista.length===1?"":"s"}`;
  const elegido=$("asignarTareaSelect").value;
  $("asignarTareasLista").innerHTML=lista.length?lista.map(t=>`<label class="assign-task-option"><input type="radio" name="asignarTareaRadio" value="${t.id}" ${t.id===elegido?"checked":""}><span class="assign-task-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></span><span class="assign-task-copy"><strong>${esc(t.nombre)}</strong><small>${duracionTexto(t.duracionMin)}</small></span><span class="assign-task-mark"><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span></label>`).join(""):'<div class="tareas-empty assign-empty"><strong>Sin coincidencias</strong><span>Probá con otro nombre.</span></div>';
}
function seleccionarTareaAsignable(id){
  $("asignarTareaSelect").value=id;
  renderTareasAsignables();
  actualizarTurnosAsignacion();
  actualizarEstadoGuardarAsignacion();
}
function renderTurnosAsignacion(disponibles,preferido=""){
  const input=$("asignarTurno"),botones=[...document.querySelectorAll("#asignarTurnoOpciones [data-turno]")];
  const elegido=disponibles.includes(preferido)?preferido:(disponibles[0]||"");
  input.value=elegido;
  botones.forEach(btn=>{const ok=disponibles.includes(btn.dataset.turno);btn.disabled=!ok;btn.classList.toggle("is-active",ok&&btn.dataset.turno===elegido);btn.setAttribute("aria-checked",String(ok&&btn.dataset.turno===elegido));});
  actualizarEstadoGuardarAsignacion();
}
function elegirTurnoAsignacion(turno){
  const btn=document.querySelector(`#asignarTurnoOpciones [data-turno="${turno}"]`);if(!btn||btn.disabled)return;
  $("asignarTurno").value=turno;
  document.querySelectorAll("#asignarTurnoOpciones [data-turno]").forEach(x=>{x.classList.toggle("is-active",x.dataset.turno===turno);x.setAttribute("aria-checked",String(x.dataset.turno===turno));});
  renderResponsablesAsignacion();
}
function actualizarTurnosAsignacion(){
  const id=$("asignarTareaSelect").value,t=leer().find(x=>x.id===id),fecha=iso(fechaSeleccionada),anterior=$("asignarTurno").value;
  if(!t){renderTurnosAsignacion([]);$("asignarUsuarios").innerHTML="";return;}
  const disponibles=["manana","tarde"].filter(turno=>!asignacion(t,fecha,turno));
  renderTurnosAsignacion(disponibles,anterior);
  renderResponsablesAsignacion();
}
async function abrirAsignar(){
  await cargarUsuariosTareas(); asignarDisponibles=tareasDisponibles(); if(!asignarDisponibles.length){window.AutoservicioDialog?.alert?.({title:"Sin tareas disponibles",message:"Todas las tareas activas de este sector ya fueron asignadas en ambos turnos para este día."});return;} $("asignarFechaTexto").textContent=fmt(fechaSeleccionada,{weekday:"long",day:"numeric",month:"long"}); $("asignarBuscarTarea").value=""; $("asignarTareaSelect").innerHTML=asignarDisponibles.map(t=>`<option value="${t.id}">${esc(t.nombre)}</option>`).join(""); $("asignarTareaSelect").value=asignarDisponibles[0].id; renderTareasAsignables();
  $("asignarModal").classList.remove("oculto");$("asignarModal").setAttribute("aria-hidden","false");
  const card=$("asignarModal").querySelector(".tarea-modal-card"); if(card)card.scrollTop=0;
  $("asignarTareasLista").scrollTop=0; $("asignarUsuarios").scrollTop=0;
  actualizarTurnosAsignacion();
}
function cerrarAsignar(){ solicitudResponsables++; $("asignarModal").classList.add("oculto");$("asignarModal").setAttribute("aria-hidden","true"); $("btnGuardarAsignar").disabled=true; }
function guardarAsignacion(){
  const id=$("asignarTareaSelect").value,turno=$("asignarTurno").value;
  const responsables=[...new Set([...document.querySelectorAll("#asignarUsuarios input:checked")].map(x=>x.value.trim()).filter(Boolean))];
  if(!id){window.AutoservicioDialog?.alert?.({title:"Elegí una tarea",message:"Seleccioná la tarea que querés asignar."});return;}
  if(!turno){window.AutoservicioDialog?.alert?.({title:"Elegí un turno",message:"Seleccioná mañana o tarde para esta asignación."});return;}
  if(!responsables.length){window.AutoservicioDialog?.alert?.({title:"Elegí responsables",message:"Seleccioná uno o varios usuarios disponibles."});return;}
  const all=leer(),t=all.find(x=>x.id===id),fecha=iso(fechaSeleccionada);
  if(!t||t.activo===false||(t.sector||"General")!==sectorSeleccionado){window.AutoservicioDialog?.alert?.({title:"Tarea no disponible",message:"La tarea ya no está disponible para este sector."});return;}
  if(asignacion(t,fecha,turno)){window.AutoservicioDialog?.alert?.({title:"Tarea ya asignada",message:`“${t.nombre}” ya tiene una asignación para ${TURNOS[turno].toLowerCase()} en este día.`});actualizarTurnosAsignacion();return;}
  t.asignaciones=t.asignaciones||{};t.asignaciones[fecha]=t.asignaciones[fecha]||{};t.asignaciones[fecha][turno]={responsables,estado:"pendiente",completadaPor:"",completadaHora:""};
  guardar(all);cerrarAsignar();renderTareas();
}

function configBano(){
  const cfg=leerJSON(BANO_KEY,{participantes:[],fechaAncla:iso(new Date())});
  return {participantes:Array.isArray(cfg.participantes)?cfg.participantes:[],fechaAncla:cfg.fechaAncla||cfg.fechaInicio||iso(new Date())};
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
  const cfg=configBano(), hoy=inicioDia(new Date()), corresponde=esDiaLimpieza(hoy,cfg), responsable=responsableBano(hoy,cfg), hist=leerJSON(BANO_HISTORY_KEY,[]);
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
function confirmarBano(){
  const hist=leerJSON(BANO_HISTORY_KEY,[]), hoyFecha=new Date(), hoy=iso(hoyFecha), cfg=configBano();
  if(!esDiaLimpieza(hoyFecha,cfg)||hist.some(h=>h.fecha===hoy))return;
  const u=usuario(); hist.push({fecha:hoy,hora:new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}),usuario:u.nombre||u.usuario||responsableBano(hoyFecha,cfg)});
  guardarJSON(BANO_HISTORY_KEY,hist); renderBano();
}
function participantesConfigActuales(){
  return [...document.querySelectorAll("#banoUsuariosDisponibles input:checked")].map(x=>x.value).filter(Boolean);
}
function renderParticipantesConfig(seleccionados){
  const marcados=new Set((seleccionados||[]).map(claveParticipante));
  $("banoParticipantesCantidad").textContent=String(marcados.size);
  const elegidos=usuariosTareas.filter(u=>marcados.has(claveParticipante(u)));
  $("banoParticipantesSeleccionados").innerHTML=elegidos.length?elegidos.map(u=>`<span class="config-selected-user">${esc(u.nombre||u.usuario)}</span>`).join(""):'<span class="config-selected-empty">Todavía no seleccionaste participantes.</span>';
  const q=normalClave($("banoBuscarUsuario")?.value||"");
  const lista=usuariosTareas.filter(u=>!q||normalClave(`${u.nombre||""} ${u.usuario||""} ${u.sector||""}`).includes(q));
  $("banoUsuariosDisponibles").innerHTML=lista.length?lista.map(u=>{
    const clave=claveParticipante(u),marcado=marcados.has(clave);
    return `<label class="config-user-option"><input type="checkbox" value="${esc(clave)}" ${marcado?"checked":""}><span class="config-user-check"><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span><span class="config-user-copy"><strong>${esc(u.nombre||u.usuario)}</strong><small>${esc(u.sector||"Sin sector")}</small></span></label>`;
  }).join(""):'<div class="config-participants-empty"><strong>Sin coincidencias</strong><span>Probá con otra búsqueda.</span></div>';
}
function guardarConfigBano(){
  const anterior=configBano(), participantes=participantesConfigActuales();
  guardarJSON(BANO_KEY,{participantes,fechaAncla:anterior.fechaAncla||iso(new Date())});
  window.AutoservicioDialog?.alert?.({title:"Configuración guardada",message:"La rotación quedó configurada para realizarse un día sí y otro no."});
  renderParticipantesConfig(participantes); renderBano();
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
  $("btnCerrarAsignarModal").onclick=$("btnCancelarAsignar").onclick=cerrarAsignar;$("btnGuardarAsignar").onclick=guardarAsignacion;document.querySelectorAll("#asignarTurnoOpciones [data-turno]").forEach(btn=>btn.onclick=()=>elegirTurnoAsignacion(btn.dataset.turno));$("asignarBuscarTarea").oninput=renderTareasAsignables;$("asignarTareasLista").onchange=e=>{if(e.target.name==="asignarTareaRadio")seleccionarTareaAsignable(e.target.value);};$("asignarUsuarios").onchange=actualizarCantidadResponsables;$("asignarModal").onclick=e=>{if(e.target.id==="asignarModal")cerrarAsignar();};
  $("tareasLista").onclick=e=>{const card=e.target.closest(".tarea-card"),btn=e.target.closest("button[data-accion]");if(card&&btn)cambiarEstado(card.dataset.id,card.dataset.turno);};
  document.querySelectorAll("[data-tareas-tab]").forEach(b=>b.onclick=()=>cambiarVista(b.dataset.tareasTab));
  $("configSectorFiltro").onchange=renderConfig;$("btnConfigCambiarSector").onclick=cambiarSectorConfig;$("btnGuardarConfigBano").onclick=guardarConfigBano;$("configBuscarTarea").oninput=renderConfig;$("btnLimpiarBusquedaTarea").onclick=()=>{$("configBuscarTarea").value="";renderConfig();};$("btnConfigTabTareas").onclick=()=>{configSubvista="tareas";actualizarConfigSubvista();};$("btnConfigTabBano").onclick=()=>{configSubvista="bano";actualizarConfigSubvista();};$("btnElegirParticipantesBano").onclick=()=>{$("banoSelectorParticipantes").classList.toggle("oculto");};$("banoBuscarUsuario").oninput=()=>renderParticipantesConfig(participantesConfigActuales());
  $("banoUsuariosDisponibles").onchange=()=>renderParticipantesConfig(participantesConfigActuales());
  $("configTareasLista").onclick=e=>{const row=e.target.closest("[data-id]");if(!row)return;const t=leer().find(x=>x.id===row.dataset.id);if(t)abrir(t);};$("configTareasLista").onkeydown=e=>{if((e.key==="Enter"||e.key===" ")&&e.target.closest("[data-id]")){e.preventDefault();e.target.closest("[data-id]").click();}};
}
async function activar(){
  activo=true;seed();
  await Promise.all([cargarContextoTareas(),cargarUsuariosTareas()]);
  await cargarTareasRemotas();
  normalizarSector();
  const esAdmin=puedeConfigurar();
  document.querySelector('[data-tareas-tab="config"]')?.classList.toggle("oculto",!esAdmin);
  if(!esAdmin&&vistaActual==="config")vistaActual="tareas";
  cambiarVista(vistaActual);
}
function desactivar(){activo=false;cerrar();}
bind();window.TareasModule={activar,desactivar};
