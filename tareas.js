import { API_BASE_URL } from "./config.js?v=96-pulido";

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

function inicioDia(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function inicioSemana(d){ const x=inicioDia(d), day=x.getDay(); x.setDate(x.getDate()-(day===0?6:day-1)); return x; }
function iso(d){ const x=inicioDia(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; }
function parseFecha(v){ const [y,m,d]=String(v||"").split("-").map(Number); return y?new Date(y,m-1,d):inicioDia(new Date()); }
function fmt(d,opt={}){ return new Intl.DateTimeFormat("es-AR",opt).format(d); }
function esc(v){const d=document.createElement("div");d.textContent=v??"";return d.innerHTML;}
function leerJSON(key, fallback){ try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}catch{return fallback;} }
function guardarJSON(key,v){ localStorage.setItem(key,JSON.stringify(v)); }
function leer(){ return leerJSON(KEY,[]); }
function guardar(v){ guardarJSON(KEY,v); }
function usuario(){ return window.AutoservicioAuth?.getUsuario?.() || {}; }
function puedeGestionar(){ return ["administrador","supervisor"].includes(usuario()?.rol); }
function claveSector(v){ return String(v||"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es"); }
function sectoresUnicos(valores){ const mapa=new Map(); for(const valor of valores){ const limpio=String(valor||"").trim(); if(!limpio)continue; const clave=claveSector(limpio); if(!mapa.has(clave))mapa.set(clave,limpio); } return [...mapa.values()]; }
function sectoresUsuario(){ const u=usuario(); return sectoresUnicos([u.sector,...(Array.isArray(u.sectores)?u.sectores:[])]); }
function todosLosSectores(){ const deTareas=leer().map(t=>t.sector).filter(Boolean); const propios=sectoresUsuario(); const base=["Caja","Depósito","Fiambrería","Carnicería","Administración","Verdulería","Panadería","Limpieza"]; return sectoresUnicos([...propios,...deTareas,...base]).sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"})); }
function sectoresPermitidos(){ const u=usuario(); return u.rol==="administrador"?todosLosSectores():(sectoresUsuario().length?sectoresUsuario():todosLosSectores().slice(0,1)); }
function normalizarSector(){ const permitidos=sectoresPermitidos(); if(!sectorSeleccionado || !permitidos.includes(sectorSeleccionado)) sectorSeleccionado=permitidos[0]||"General"; }
function normalizarTurnoPermitido(v){ const x=String(v||"").toLowerCase(); if(x==="manana"||x==="tarde"||x==="ambos")return x; if(x.includes("15:00")||x.includes("tarde"))return "tarde"; return "manana"; }
function duracionTexto(v){ const n=Number(v); return Number.isFinite(n)&&n>0?`${n} min`:String(v||"Sin duración"); }
function diasSeleccionados(){ return [...document.querySelectorAll("#tareaDiasRepeticion input:checked")].map(x=>Number(x.value)); }

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

function correspondeDia(t,fecha){ return t.activo!==false && (t.diasSemana||[]).includes(parseFecha(fecha).getDay()); }
function turnosPermitidos(t){ return t.turnoPermitido==="ambos"?["manana","tarde"]:[normalizarTurnoPermitido(t.turnoPermitido)]; }
function asignacion(t,fecha,turno){ return t.asignaciones?.[fecha]?.[turno]||null; }
function asignacionesDelDia(){
 const fecha=iso(fechaSeleccionada), out=[];
 leer().filter(t=>(t.sector||"General")===sectorSeleccionado).forEach(t=>{
   for(const turno of turnosPermitidos(t)){
     const a=asignacion(t,fecha,turno); if(a) out.push({...t,_turno:turno,_asignacion:a,estado:a.estado||"pendiente"});
   }
 }); return out;
}
function tareasDisponibles(){ const fecha=iso(fechaSeleccionada); return leer().filter(t=>(t.sector||"General")===sectorSeleccionado && correspondeDia(t,fecha) && turnosPermitidos(t).some(turno=>!asignacion(t,fecha,turno))); }
function colorTurno(t){ return t==="manana"?"turno-manana":"turno-tarde"; }
function responsablesHTML(valor){ const nombres=Array.isArray(valor)?valor:String(valor||"").split(",").map(x=>x.trim()).filter(Boolean); if(!nombres.length)return '<span class="tarea-persona sin-responsable">Sin responsable</span>'; return nombres.map(nombre=>`<span class="tarea-persona"><svg class="app-icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M6 20c.4-4 2.4-6 6-6s5.6 2 6 6"/></svg>${esc(nombre)}</span>`).join(""); }

function renderDias(){ const box=$("tareasDias"); if(!box)return; box.innerHTML=""; for(let i=0;i<7;i++){const d=new Date(semanaBase);d.setDate(d.getDate()+i);const b=document.createElement("button");b.type="button";b.className=[iso(d)===iso(fechaSeleccionada)?"activo":"",iso(d)===iso(new Date())?"hoy":""].filter(Boolean).join(" ");b.innerHTML=`<strong>${DIAS[d.getDay()]}</strong><span>${d.getDate()}</span>`;b.onclick=()=>{fechaSeleccionada=d;renderTareas();};box.appendChild(b);} }
function renderResumen(items){ const n=s=>items.filter(t=>t.estado===s).length; $("tareasResumen").innerHTML=`<div><small>Total</small><strong>${items.length}</strong></div><div class="pend"><small>Pend.</small><strong>${n("pendiente")}</strong></div><div class="comp"><small>Comp.</small><strong>${n("completada")}</strong></div>`; }
function renderLista(items){ const box=$("tareasLista"); if(!items.length){box.innerHTML='<div class="tareas-empty tareas-empty-day"><span class="tareas-empty-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></span><strong>Sin tareas asignadas</strong><span>Usá “Asignar tarea” para organizar este día.</span></div>';return;} box.innerHTML=items.map(t=>`<article class="tarea-card" data-id="${t.id}" data-turno="${t._turno}"><div class="tarea-card-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></div><div class="tarea-card-main"><div class="tarea-card-title"><h3>${esc(t.nombre)}</h3><span class="tarea-sector">${esc(t.sector||"General")}</span></div><div class="tarea-assignment"><span class="turno-chip ${colorTurno(t._turno)}">${TURNOS[t._turno]}</span>${responsablesHTML(t._asignacion.responsables)}</div><div class="tarea-duration"><svg class="app-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>${duracionTexto(t.duracionMin)}</div></div><div class="tarea-card-state estado-${t.estado}"><strong><span class="estado-dot"></span>${t.estado==="completada"?"COMPLETADA":"PENDIENTE"}</strong>${t.estado==="completada"?`<small>por ${esc(t._asignacion.completadaPor||"")}</small>`:`<button type="button" data-accion="completar">Completar</button>`}</div></article>`).join(""); }
function renderTareas(){ normalizarSector(); const items=asignacionesDelDia(); $("tareasSectorNombre").textContent=sectorSeleccionado; const puedeCambiarSector=sectoresPermitidos().length>1; $("btnTareasCambiarSector").disabled=!puedeCambiarSector; $("btnTareasCambiarSector").classList.toggle("sector-unico",!puedeCambiarSector); $("btnTareasSemanaActual").textContent=`${fmt(semanaBase,{day:"2-digit",month:"short"})} - ${fmt(new Date(semanaBase.getFullYear(),semanaBase.getMonth(),semanaBase.getDate()+6),{day:"2-digit",month:"short"})}`; $("tareasFechaTitulo").textContent=fmt(fechaSeleccionada,{weekday:"long",day:"numeric",month:"long"}).toUpperCase(); $("btnNuevaTarea").textContent="+ Asignar tarea"; $("btnNuevaTarea").classList.toggle("oculto",!puedeGestionar()); renderDias();renderResumen(items);renderLista(items); }
function cambiarEstado(id,turno){ const all=leer(),t=all.find(x=>x.id===id),fecha=iso(fechaSeleccionada),a=t?.asignaciones?.[fecha]?.[turno]; if(!a)return; a.estado="completada"; const u=usuario();a.completadaPor=u.nombre||u.usuario||"Usuario";a.completadaHora=new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});guardar(all);renderTareas(); }

function abrir(t=null){ tareaEditando=t;normalizarSector(); $("tareaModalTitulo").textContent=t?"Editar tarea":"Nueva tarea"; $("tareaNombre").value=t?.nombre||""; $("tareaDuracion").value=String(t?.duracionMin||10); $("tareaTurno").value=t?.turnoPermitido||"manana"; $("tareaDescripcion").value=t?.descripcion||""; document.querySelectorAll("#tareaDiasRepeticion input").forEach(x=>x.checked=(t?.diasSemana||[]).includes(Number(x.value))); $("btnEliminarTarea").classList.toggle("oculto",!t); $("tareaModal").classList.remove("oculto"); $("tareaModal").setAttribute("aria-hidden","false"); }
function cerrar(){ $("tareaModal").classList.add("oculto"); $("tareaModal").setAttribute("aria-hidden","true"); tareaEditando=null; }
function guardarForm(){ const nombre=$("tareaNombre").value.trim(),diasSemana=diasSeleccionados(),duracionMin=Number($("tareaDuracion").value); if(!nombre){window.AutoservicioDialog?.alert?.({title:"Falta el nombre",message:"Escribí el nombre de la tarea."});return;} if(!diasSemana.length){window.AutoservicioDialog?.alert?.({title:"Elegí los días",message:"Seleccioná al menos un día de realización."});return;} if(!Number.isFinite(duracionMin)||duracionMin<1){window.AutoservicioDialog?.alert?.({title:"Duración inválida",message:"Seleccioná una duración válida."});return;} const all=leer(),data={nombre,descripcion:$("tareaDescripcion").value.trim(),sector:sectorSeleccionado,duracionMin,diasSemana,turnoPermitido:$("tareaTurno").value,activo:true}; if(tareaEditando){const actual=all.find(x=>x.id===tareaEditando.id);Object.assign(actual,data);}else all.push({id:crypto.randomUUID?.()||String(Date.now()),...data,asignaciones:{}});guardar(all);cerrar();renderTareas();renderConfig(); }
async function eliminarTareaActual(){ if(!tareaEditando)return; const ok=await window.AutoservicioDialog?.confirm?.({title:"Eliminar tarea",message:`¿Eliminar “${tareaEditando.nombre}”?`,confirmText:"Eliminar",danger:true});if(ok===false)return;guardar(leer().filter(x=>x.id!==tareaEditando.id));cerrar();renderTareas();renderConfig(); }
async function confirmarEliminar(t){ const ok=await window.AutoservicioDialog?.confirm?.({title:"Eliminar tarea",message:`¿Eliminar “${t.nombre}”?`,confirmText:"Eliminar",danger:true});if(ok===false)return;guardar(leer().filter(x=>x.id!==t.id));renderConfig();renderTareas(); }

async function cargarUsuariosTareas(){ try{const r=await fetch(`${API_BASE_URL}/tareas/usuarios`),data=await r.json();if(r.ok&&data.ok)usuariosTareas=data.usuarios||[];}catch{} if(!usuariosTareas.length){const u=usuario();usuariosTareas=u.nombre?[{usuario:u.usuario||u.nombre,nombre:u.nombre,sector:u.sector||""}]:[];} }
function usuariosDelSector(){ return usuariosTareas.filter(u=>!u.sector||u.sector===sectorSeleccionado||(u.sectores||[]).includes(sectorSeleccionado)); }
function actualizarTurnosAsignacion(){ const id=$("asignarTareaSelect").value,t=leer().find(x=>x.id===id),fecha=iso(fechaSeleccionada),sel=$("asignarTurno"); if(!t){sel.innerHTML="";return;} const disponibles=turnosPermitidos(t).filter(turno=>!asignacion(t,fecha,turno)); sel.innerHTML=disponibles.map(turno=>`<option value="${turno}">${TURNOS[turno]}</option>`).join(""); }
async function abrirAsignar(){ await cargarUsuariosTareas(); const disponibles=tareasDisponibles(); if(!disponibles.length){window.AutoservicioDialog?.alert?.({title:"Sin tareas disponibles",message:"Todas las tareas previstas para este día ya fueron asignadas."});return;} $("asignarFechaTexto").textContent=fmt(fechaSeleccionada,{weekday:"long",day:"numeric",month:"long"}); $("asignarTareaSelect").innerHTML=disponibles.map(t=>`<option value="${t.id}">${esc(t.nombre)}</option>`).join(""); $("asignarUsuarios").innerHTML=usuariosDelSector().map(u=>`<label><input type="checkbox" value="${esc(u.nombre||u.usuario)}"><span>${esc(u.nombre||u.usuario)}</span></label>`).join("")||'<div class="tareas-empty">No hay usuarios disponibles para este sector.</div>'; actualizarTurnosAsignacion(); $("asignarModal").classList.remove("oculto");$("asignarModal").setAttribute("aria-hidden","false"); }
function cerrarAsignar(){ $("asignarModal").classList.add("oculto");$("asignarModal").setAttribute("aria-hidden","true"); }
function guardarAsignacion(){ const id=$("asignarTareaSelect").value,turno=$("asignarTurno").value,responsables=[...document.querySelectorAll("#asignarUsuarios input:checked")].map(x=>x.value); if(!responsables.length){window.AutoservicioDialog?.alert?.({title:"Elegí responsables",message:"Seleccioná uno o varios usuarios."});return;} const all=leer(),t=all.find(x=>x.id===id),fecha=iso(fechaSeleccionada);if(!t||!turno||asignacion(t,fecha,turno))return;t.asignaciones=t.asignaciones||{};t.asignaciones[fecha]=t.asignaciones[fecha]||{};t.asignaciones[fecha][turno]={responsables,estado:"pendiente",completadaPor:"",completadaHora:""};guardar(all);cerrarAsignar();renderTareas(); }

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
function renderParticipantesConfig(participantes){
  const claves=[...new Set((participantes||[]).map(claveParticipante).filter(Boolean))];
  $("banoParticipantesCantidad").textContent=String(claves.length);
  const disponibles=usuariosTareas.slice().sort((a,b)=>(a.nombre||a.usuario).localeCompare(b.nombre||b.usuario,"es"));
  $("banoUsuariosDisponibles").innerHTML=disponibles.length?disponibles.map(u=>{
    const clave=u.usuario||u.nombre, marcado=claves.some(x=>x===clave||x===(u.nombre||u.usuario));
    return `<label class="config-user-option"><input type="checkbox" value="${esc(clave)}" ${marcado?"checked":""}><span class="config-user-check"><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span><span class="config-user-copy"><strong>${esc(u.nombre||u.usuario)}</strong><small>${esc(u.sector||"Sin sector")}</small></span></label>`;
  }).join(""):'<div class="config-participants-empty"><strong>No hay usuarios disponibles</strong><span>Revisá los usuarios activos en Administración.</span></div>';
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
  const permiso=puedeGestionar(); $("tareasConfigSinPermiso").classList.toggle("oculto",permiso); $("tareasConfigContenido").classList.toggle("oculto",!permiso); if(!permiso)return;
  const sectores=sectoresPermitidos(),sel=$("configSectorFiltro"),actual=sel.value||sectorSeleccionado||sectores[0]||"General"; sel.innerHTML=sectores.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");sel.value=sectores.includes(actual)?actual:(sectores[0]||"");sectorSeleccionado=sel.value||sectorSeleccionado;$("configSectorNombre").textContent=sel.value||"General";
  const lista=leer().filter(t=>(t.sector||"General")===sel.value),activas=lista.filter(t=>t.activo!==false).length;$("configTareasResumen").innerHTML=`<div><small>Total</small><strong>${lista.length}</strong></div><div><small>Activas</small><strong>${activas}</strong></div><div><small>Desactivadas</small><strong>${lista.length-activas}</strong></div>`;
  $("configTareasLista").innerHTML=lista.length?lista.map(t=>`<article class="config-task-row ${t.activo===false?"is-disabled":""}" data-id="${t.id}"><span class="config-task-icon"><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span><div class="config-task-copy"><div><strong>${esc(t.nombre)}</strong><span class="config-status-pill">${t.activo===false?"Desactivada":"Activa"}</span></div><p>${duracionTexto(t.duracionMin)} · ${t.turnoPermitido==="ambos"?"Mañana y tarde":TURNOS[t.turnoPermitido]||"Mañana"}</p><small>${(t.diasSemana||[]).map(d=>DIAS[d]).join(" · ")||"Sin días"}</small></div><div class="config-task-actions"><button type="button" data-config-action="delete" class="is-danger"><span>Eliminar</span></button><button type="button" data-config-action="toggle"><span>${t.activo===false?"Activar":"Desactivar"}</span></button><button type="button" data-config-action="edit" class="is-primary"><span>Editar</span></button></div></article>`).join(""):`<div class="tareas-empty config-tasks-empty"><strong>Sin tareas configuradas</strong><span>Agregá la primera tarea de ${esc(sel.value||"este sector")}.</span></div>`;
  const cfg=configBano();renderParticipantesConfig(cfg.participantes);
}

async function cambiarSector(){ const opts=sectoresPermitidos().map(s=>({value:s,label:s})); if(window.AppChoicePicker?.open){const v=await window.AppChoicePicker.open({title:"Seleccionar sector",kicker:"Tareas",value:sectorSeleccionado,options:opts});if(v){sectorSeleccionado=v;renderTareas();}} else { const v=prompt("Sector",sectorSeleccionado); if(v){sectorSeleccionado=v;renderTareas();} } }
function cambiarVista(v){ vistaActual=v; document.querySelectorAll("[data-tareas-view]").forEach(x=>{const visible=x.dataset.tareasView===v;x.classList.toggle("oculto",!visible);x.setAttribute("aria-hidden",visible?"false":"true");}); document.querySelectorAll("[data-tareas-tab]").forEach(x=>{const activo=x.dataset.tareasTab===v;x.classList.toggle("activo",activo);x.setAttribute("aria-current",activo?"page":"false");}); if(v==="tareas")renderTareas(); if(v==="bano")renderBano(); if(v==="config")renderConfig(); requestAnimationFrame(()=>window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})); }

function bind(){
  $("btnTareasSemanaAnterior").onclick=()=>{semanaBase.setDate(semanaBase.getDate()-7);fechaSeleccionada=new Date(semanaBase);renderTareas();};
  $("btnTareasSemanaSiguiente").onclick=()=>{semanaBase.setDate(semanaBase.getDate()+7);fechaSeleccionada=new Date(semanaBase);renderTareas();};
  $("btnTareasSemanaActual").onclick=()=>{fechaSeleccionada=inicioDia(new Date());semanaBase=inicioSemana(fechaSeleccionada);renderTareas();};
  $("btnTareasCambiarSector").onclick=cambiarSector;$("btnNuevaTarea").onclick=abrirAsignar;$("btnConfigNuevaTarea").onclick=()=>{sectorSeleccionado=$("configSectorFiltro").value||sectorSeleccionado;abrir();};
  $("btnCerrarTareaModal").onclick=$("btnCancelarTarea").onclick=cerrar;$("btnGuardarTarea").onclick=guardarForm;$("btnEliminarTarea").onclick=eliminarTareaActual;$("tareaModal").onclick=e=>{if(e.target.id==="tareaModal")cerrar();};
  $("btnCerrarAsignarModal").onclick=$("btnCancelarAsignar").onclick=cerrarAsignar;$("btnGuardarAsignar").onclick=guardarAsignacion;$("asignarTareaSelect").onchange=actualizarTurnosAsignacion;$("asignarModal").onclick=e=>{if(e.target.id==="asignarModal")cerrarAsignar();};
  $("tareasLista").onclick=e=>{const card=e.target.closest(".tarea-card"),btn=e.target.closest("button[data-accion]");if(card&&btn)cambiarEstado(card.dataset.id,card.dataset.turno);};
  document.querySelectorAll("[data-tareas-tab]").forEach(b=>b.onclick=()=>cambiarVista(b.dataset.tareasTab));
  $("configSectorFiltro").onchange=renderConfig;$("btnConfigCambiarSector").onclick=cambiarSectorConfig;$("btnGuardarConfigBano").onclick=guardarConfigBano;
  $("banoUsuariosDisponibles").onchange=()=>{$("banoParticipantesCantidad").textContent=String(participantesConfigActuales().length);};
  $("configTareasLista").onclick=e=>{const a=e.target.closest("button[data-config-action]"),row=e.target.closest("[data-id]");if(!a||!row)return;const all=leer(),t=all.find(x=>x.id===row.dataset.id);if(!t)return;if(a.dataset.configAction==="edit")abrir(t);else if(a.dataset.configAction==="delete")confirmarEliminar(t);else{t.activo=t.activo===false;guardar(all);renderConfig();renderTareas();}};
}
async function activar(){activo=true;seed();await cargarUsuariosTareas();normalizarSector();cambiarVista(vistaActual);}
function desactivar(){activo=false;cerrar();}
bind();window.TareasModule={activar,desactivar};
