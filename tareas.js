const $ = id => document.getElementById(id);
const KEY = "autoservicio_tareas_v2";
const OLD_KEY = "autoservicio_tareas_v1";
const BANO_KEY = "autoservicio_bano_config_v1";
const BANO_HISTORY_KEY = "autoservicio_bano_historial_v1";
const DIAS = ["DOM","LUN","MAR","MIÉ","JUE","VIE","SÁB"];
let fechaSeleccionada = inicioDia(new Date());
let semanaBase = inicioSemana(fechaSeleccionada);
let tareaEditando = null;
let activo = false;
let vistaActual = "tareas";
let sectorSeleccionado = "";

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
function sectoresUsuario(){ const u=usuario(); return [...new Set([u.sector,...(Array.isArray(u.sectores)?u.sectores:[])].filter(Boolean))]; }
function todosLosSectores(){ const deTareas=leer().map(t=>t.sector).filter(Boolean); const propios=sectoresUsuario(); const base=["Caja","Depósito","Fiambrería","Carnicería","Administración","Verdulería","Panadería","Limpieza"]; return [...new Set([...propios,...deTareas,...base])].sort((a,b)=>a.localeCompare(b,"es")); }
function sectoresPermitidos(){ const u=usuario(); return u.rol==="administrador"?todosLosSectores():(sectoresUsuario().length?sectoresUsuario():todosLosSectores().slice(0,1)); }
function normalizarSector(){ const permitidos=sectoresPermitidos(); if(!sectorSeleccionado || !permitidos.includes(sectorSeleccionado)) sectorSeleccionado=permitidos[0]||"General"; }

function seed(){
  if(!leer().length){
    const prev=leerJSON(OLD_KEY,[]);
    if(prev.length){ guardar(prev); }
    else {
      const lunes=inicioSemana(new Date());
      const datos=[
        ["Limpieza panera","Panadería","Camila","7:00 - 14:00","10 min",0],
        ["Envasar pan","Panadería","Camila, Cynthia","8:00 - 15:00","45 min",0],
        ["Barrer vereda","Limpieza","Cynthia, Sofia","15:00 - 22:00","20/30 min",0],
        ["Limpieza de vidrios, marcos y puertas","Limpieza","Yuliana","8:00 - 15:00","20/30 min",0],
        ["Limpieza y orden de cajas","Caja","Camila, Sofia","7:00 - 14:00","15 min",0]
      ];
      guardar(datos.map((x,i)=>({id:crypto.randomUUID?.()||String(Date.now()+i),nombre:x[0],sector:x[1],responsables:x[2],turno:x[3],duracion:x[4],fecha:iso(new Date(lunes.getFullYear(),lunes.getMonth(),lunes.getDate()+x[5])),estado:i===1?"proceso":i===2||i===3?"completada":"pendiente",descripcion:"",activo:true,completadaPor:i>1?x[2].split(',')[0]:"",completadaHora:i>1?"14:18":""})));
    }
  }
  if(!localStorage.getItem(BANO_KEY)) guardarJSON(BANO_KEY,{participantes:["Camila","Bruno","Cynthia","Sofía","Yuliana"],intervalo:2,fechaInicio:iso(new Date())});
}
function colorTurno(t){ return String(t).startsWith("7:")?"turno-manana":String(t).startsWith("8:")?"turno-tarde":"turno-noche"; }

function diasRepeticionSeleccionados(){ return [...document.querySelectorAll("#tareaDiasRepeticion input:checked")].map(x=>Number(x.value)); }
function estadoEnFecha(t,fecha){
  if(!t.repetirSemanal) return {estado:t.estado||"pendiente",completadaPor:t.completadaPor||"",completadaHora:t.completadaHora||""};
  const registro=(t.registros||{})[fecha]||{};
  return {estado:registro.estado||"pendiente",completadaPor:registro.completadaPor||"",completadaHora:registro.completadaHora||""};
}
function apareceEnFecha(t,fecha){
  if(t.activo===false)return false;
  if(!t.repetirSemanal)return t.fecha===fecha;
  const d=parseFecha(fecha), inicio=parseFecha(t.fecha);
  return d>=inicio && (Array.isArray(t.diasSemana)?t.diasSemana:[]).includes(d.getDay());
}
function tareaParaFecha(t,fecha){ return {...t,...estadoEnFecha(t,fecha),_fechaVista:fecha}; }
function actualizarDiasRepeticion(){ const activo=$("tareaRepetir").checked; $("tareaDiasRepeticion").classList.toggle("is-disabled",!activo); }


function renderDias(){ const box=$("tareasDias"); if(!box)return; box.innerHTML=""; for(let i=0;i<7;i++){const d=new Date(semanaBase);d.setDate(d.getDate()+i);const b=document.createElement("button");b.type="button";b.className=[iso(d)===iso(fechaSeleccionada)?"activo":"",iso(d)===iso(new Date())?"hoy":""].filter(Boolean).join(" ");b.innerHTML=`<strong>${DIAS[d.getDay()]}</strong><span>${d.getDate()}</span>`;b.onclick=()=>{fechaSeleccionada=d;renderTareas();};box.appendChild(b);} }
function renderResumen(items){ const n=s=>items.filter(t=>t.estado===s).length; $("tareasResumen").innerHTML=`<div><small>Total</small><strong>${items.length}</strong></div><div class="pend"><small>Pend.</small><strong>${n("pendiente")}</strong></div><div class="proc"><small>Proc.</small><strong>${n("proceso")}</strong></div><div class="comp"><small>Comp.</small><strong>${n("completada")}</strong></div>`; }
function responsablesHTML(valor){
  const nombres=String(valor||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(!nombres.length)return '<span class="tarea-persona sin-responsable">Sin responsable</span>';
  return nombres.map(nombre=>`<span class="tarea-persona"><svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M6 20c.4-4 2.4-6 6-6s5.6 2 6 6"/></svg>${esc(nombre)}</span>`).join("");
}
function renderLista(items){
  const box=$("tareasLista");
  if(!items.length){box.innerHTML='<div class="tareas-empty tareas-empty-day"><span class="tareas-empty-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></span><strong>Sin tareas para este día</strong><span>No hay tareas programadas para este sector.</span></div>';return;}
  box.innerHTML=items.map(t=>`<article class="tarea-card" data-id="${t.id}">
    <div class="tarea-card-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></div>
    <div class="tarea-card-main">
      <div class="tarea-card-title"><h3>${esc(t.nombre)}</h3><span class="tarea-sector">${esc(t.sector||"General")}</span></div>
      <div class="tarea-assignment"><span class="turno-chip ${colorTurno(t.turno)}">${esc(t.turno)}</span>${responsablesHTML(t.responsables)}</div>
      <div class="tarea-duration"><svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>${esc(t.duracion||"Sin duración")}</div>
      ${t.repetirSemanal?'<span class="tarea-card-recurring"><svg class="app-icon" viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5M6.1 9A7 7 0 0 1 18 6l2 1M3.9 15A7 7 0 0 0 16 18l2-1"/></svg>Repetición semanal</span>':''}
    </div>
    <div class="tarea-card-state estado-${t.estado}">
      <strong><span class="estado-dot"></span>${t.estado==="proceso"?"EN PROCESO":t.estado==="completada"?"COMPLETADA":"PENDIENTE"}</strong>
      ${t.estado==="completada"?`<small>${esc(t.completadaHora||"")}<br>por ${esc(t.completadaPor||"")}</small>`:`<button type="button" data-accion="${t.estado==="pendiente"?"iniciar":"completar"}">${t.estado==="pendiente"?"Confirmar":"Completar"}</button>`}
    </div>
  </article>`).join("");
}
function renderTareas(){
  normalizarSector();
  const fechaVista=iso(fechaSeleccionada);
  const items=leer().filter(t=>apareceEnFecha(t,fechaVista) && (t.sector||"General")===sectorSeleccionado).map(t=>tareaParaFecha(t,fechaVista));
  $("tareasSectorNombre").textContent=sectorSeleccionado;
  const puedeCambiarSector=sectoresPermitidos().length>1;
  $("btnTareasCambiarSector").disabled=!puedeCambiarSector;
  $("btnTareasCambiarSector").classList.toggle("sector-unico",!puedeCambiarSector);
  $("btnTareasSemanaActual").textContent=`${fmt(semanaBase,{day:"2-digit",month:"short"})} - ${fmt(new Date(semanaBase.getFullYear(),semanaBase.getMonth(),semanaBase.getDate()+6),{day:"2-digit",month:"short"})}`;
  $("tareasFechaTitulo").textContent=fmt(fechaSeleccionada,{weekday:"long",day:"numeric",month:"long"}).toUpperCase();
  $("btnNuevaTarea").classList.toggle("oculto",!puedeGestionar());
  renderDias();renderResumen(items);renderLista(items);
}
function cambiarEstado(id,accion,fecha=iso(fechaSeleccionada)){ const all=leer(), t=all.find(x=>x.id===id); if(!t)return; const estado=accion==="iniciar"?"proceso":"completada", u=usuario(), registro={estado}; if(estado==="completada"){registro.completadaPor=u.nombre||u.usuario||"Usuario";registro.completadaHora=new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});} if(t.repetirSemanal){t.registros=t.registros||{};t.registros[fecha]=registro;}else Object.assign(t,registro); guardar(all);renderTareas(); }
function abrir(t=null){tareaEditando=t;normalizarSector();$("tareaModalTitulo").textContent=t?"Editar tarea":"Nueva tarea";$("tareaNombre").value=t?.nombre||"";$("tareaFecha").value=t?.fecha||iso(fechaSeleccionada);$("tareaDuracion").value=t?.duracion||"";$("tareaSector").value=t?.sector||sectorSeleccionado;$("tareaResponsables").value=t?.responsables||"";$("tareaTurno").value=t?.turno||"7:00 - 14:00";$("tareaDescripcion").value=t?.descripcion||"";$("tareaRepetir").checked=!!t?.repetirSemanal;document.querySelectorAll("#tareaDiasRepeticion input").forEach(x=>x.checked=(t?.diasSemana||[parseFecha(t?.fecha||iso(fechaSeleccionada)).getDay()]).includes(Number(x.value)));actualizarDiasRepeticion();$("btnEliminarTarea").classList.toggle("oculto",!t);$("tareaModal").classList.remove("oculto");$("tareaModal").setAttribute("aria-hidden","false");}
function cerrar(){$("tareaModal").classList.add("oculto");$("tareaModal").setAttribute("aria-hidden","true");}
function guardarForm(){const nombre=$("tareaNombre").value.trim();if(!nombre){window.AutoservicioDialog?.alert?.({title:"Falta el nombre",message:"Escribí el nombre de la tarea."});return;}const repetirSemanal=$("tareaRepetir").checked,diasSemana=diasRepeticionSeleccionados();if(repetirSemanal&&!diasSemana.length){window.AutoservicioDialog?.alert?.({title:"Elegí los días",message:"Seleccioná al menos un día para repetir la tarea."});return;}const all=leer(), data={nombre,fecha:$("tareaFecha").value||iso(fechaSeleccionada),sector:$("tareaSector").value.trim()||sectorSeleccionado,responsables:$("tareaResponsables").value.trim(),turno:$("tareaTurno").value,duracion:$("tareaDuracion").value.trim(),descripcion:$("tareaDescripcion").value.trim(),repetirSemanal,diasSemana:repetirSemanal?diasSemana:[],activo:true};if(tareaEditando){const actual=all.find(x=>x.id===tareaEditando.id);Object.assign(actual,data);if(!repetirSemanal)delete actual.registros;}else all.push({id:crypto.randomUUID?.()||String(Date.now()),...data,estado:"pendiente",registros:{}});guardar(all);sectorSeleccionado=data.sector;cerrar();renderTareas();renderConfig();}

async function confirmarEliminar(t){
  let ok=true;
  if(window.AutoservicioDialog?.confirm) ok=await window.AutoservicioDialog.confirm({title:"Eliminar tarea",message:`Se eliminará “${t.nombre}” y su historial de confirmaciones.`,confirmText:"Eliminar",cancelText:"Cancelar",danger:true});
  else ok=confirm(`¿Eliminar la tarea “${t.nombre}”?`);
  if(!ok)return;
  guardar(leer().filter(x=>x.id!==t.id)); if(tareaEditando?.id===t.id)cerrar(); renderConfig();renderTareas();
}
function eliminarTareaActual(){ if(tareaEditando)confirmarEliminar(tareaEditando); }

function configBano(){ return leerJSON(BANO_KEY,{participantes:[],intervalo:2,fechaInicio:iso(new Date())}); }
function indiceBano(fecha,cfg){ if(!cfg.participantes.length)return -1; const dias=Math.floor((inicioDia(fecha)-parseFecha(cfg.fechaInicio))/86400000); return ((Math.floor(dias/Math.max(1,Number(cfg.intervalo)||2))%cfg.participantes.length)+cfg.participantes.length)%cfg.participantes.length; }
function responsableBano(fecha,cfg){ const i=indiceBano(fecha,cfg); return i<0?"Sin participantes":cfg.participantes[i]; }
function renderBano(){
  const cfg=configBano(), hoy=inicioDia(new Date()), responsable=responsableBano(hoy,cfg), hist=leerJSON(BANO_HISTORY_KEY,[]);
  const confirmado=hist.find(h=>h.fecha===iso(hoy));
  const sinParticipantes=responsable==="Sin participantes";
  const inicial=sinParticipantes?"—":responsable.charAt(0).toUpperCase();
  $("banoTurnoActual").innerHTML=`
    <div class="bano-hero-head">
      <div><span class="bano-eyebrow">RESPONSABLE DE HOY</span><strong>${fmt(hoy,{weekday:"long",day:"numeric",month:"long"})}</strong></div>
      <span class="bano-status-pill ${confirmado?"is-done":"is-pending"}">${confirmado?"Completada":"Pendiente"}</span>
    </div>
    <div class="bano-hero-person">
      <div class="bano-avatar">${esc(inicial)}</div>
      <div class="bano-person-copy"><small>Le corresponde a</small><h3>${esc(responsable)}</h3><p>Rotación cada ${Math.max(1,Number(cfg.intervalo)||2)} días</p></div>
    </div>
    ${confirmado?`<div class="bano-confirmed"><svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><div><strong>Limpieza confirmada</strong><span>${esc(confirmado.hora)} · ${esc(confirmado.usuario)}</span></div></div>`:`<button id="btnConfirmarBano" class="bano-confirm-btn" type="button" ${sinParticipantes?"disabled":""}><svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>Confirmar limpieza</button>`}`;
  const proximos=[];
  for(let i=1;i<=5;i++){
    const d=new Date(hoy); d.setDate(d.getDate()+i*Math.max(1,Number(cfg.intervalo)||2));
    proximos.push({fecha:d,nombre:responsableBano(d,cfg),orden:i});
  }
  $("banoProximos").innerHTML=proximos.length?proximos.map(x=>`<article class="bano-turn-card"><div class="bano-turn-date"><strong>${x.fecha.getDate()}</strong><span>${fmt(x.fecha,{month:"short"}).replace('.','')}</span></div><div class="bano-turn-copy"><small>Próximo turno ${x.orden}</small><strong>${esc(x.nombre)}</strong><span>${fmt(x.fecha,{weekday:"long"})}</span></div><svg class="app-icon bano-turn-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></article>`).join(""):'<div class="tareas-empty"><strong>Sin participantes</strong><span>Agregalos desde Configuración.</span></div>';
  $("banoHistorial").innerHTML=hist.length?hist.slice().reverse().slice(0,5).map(h=>`<article class="bano-history-card"><span class="bano-history-check"><svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></span><div><strong>${esc(h.usuario)}</strong><span>${fmt(parseFecha(h.fecha),{weekday:"long",day:"numeric",month:"long"})}</span></div><time>${esc(h.hora)}</time></article>`).join(""):'<div class="tareas-empty bano-empty-history"><span class="tareas-empty-icon"><svg class="app-icon" viewBox="0 0 24 24"><path d="M12 8v5l3 2"/><circle cx="12" cy="12" r="9"/></svg></span><strong>Sin confirmaciones</strong><span>Las limpiezas confirmadas aparecerán acá.</span></div>';
  $("btnConfirmarBano")?.addEventListener("click",confirmarBano);
}
function confirmarBano(){ const hist=leerJSON(BANO_HISTORY_KEY,[]), hoy=iso(new Date()); if(hist.some(h=>h.fecha===hoy))return; const u=usuario(), cfg=configBano(); hist.push({fecha:hoy,hora:new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}),usuario:u.nombre||u.usuario||responsableBano(new Date(),cfg)}); guardarJSON(BANO_HISTORY_KEY,hist); renderBano(); }

function participantesConfigActuales(){
  return [...document.querySelectorAll("#banoParticipantesChips [data-participante]")].map(x=>x.dataset.participante).filter(Boolean);
}
function renderParticipantesConfig(participantes){
  const unicos=[...new Set((participantes||[]).map(x=>String(x).trim()).filter(Boolean))];
  $("banoParticipantes").value=unicos.join("\n");
  $("banoParticipantesCantidad").textContent=String(unicos.length);
  $("banoParticipantesChips").innerHTML=unicos.length?unicos.map((nombre,i)=>`<span class="config-person-chip" data-participante="${esc(nombre)}"><span class="config-person-order">${i+1}</span><strong>${esc(nombre)}</strong><button type="button" data-remove-participant aria-label="Quitar a ${esc(nombre)}"><svg class="app-icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></span>`).join(""):'<div class="config-participants-empty"><strong>Sin participantes</strong><span>Agregá personas para comenzar la rotación.</span></div>';
}
function agregarParticipanteConfig(){
  const input=$("banoParticipanteNuevo"), nombre=input.value.trim(); if(!nombre)return;
  const actuales=participantesConfigActuales();
  if(actuales.some(x=>x.localeCompare(nombre,"es",{sensitivity:"accent"})===0)){input.value="";return;}
  renderParticipantesConfig([...actuales,nombre]); input.value=""; input.focus();
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
  const sectores=sectoresPermitidos(); const sel=$("configSectorFiltro"); const actual=sel.value||sectorSeleccionado||sectores[0]||"General"; sel.innerHTML=sectores.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join(""); sel.value=sectores.includes(actual)?actual:(sectores[0]||""); sectorSeleccionado=sel.value||sectorSeleccionado;
  $("configSectorNombre").textContent=sel.value||"General";
  const lista=leer().filter(t=>(t.sector||"General")===sel.value), activas=lista.filter(t=>t.activo!==false).length;
  $("configTareasResumen").innerHTML=`<div><small>Total</small><strong>${lista.length}</strong></div><div><small>Activas</small><strong>${activas}</strong></div><div><small>Desactivadas</small><strong>${lista.length-activas}</strong></div>`;
  $("configTareasLista").innerHTML=lista.length?lista.map(t=>`<article class="config-task-row ${t.activo===false?"is-disabled":""}" data-id="${t.id}"><span class="config-task-icon"><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span><div class="config-task-copy"><div><strong>${esc(t.nombre)}</strong><span class="config-status-pill">${t.activo===false?"Desactivada":"Activa"}</span></div><p>${esc(t.duracion||"Sin duración")} · ${esc(t.turno||"Sin turno")}</p><small>${esc(t.responsables||"Sin responsables")}</small>${t.repetirSemanal?'<small class="repeat-note">Repetición semanal</small>':''}</div><div class="config-task-actions"><button type="button" data-config-action="delete" class="is-danger" aria-label="Eliminar"><svg class="app-icon" viewBox="0 0 24 24"><path d="M5 12h14"/></svg><span>Eliminar</span></button><button type="button" data-config-action="toggle" aria-label="${t.activo===false?"Activar":"Desactivar"}"><svg class="app-icon" viewBox="0 0 24 24"><path d="M5 12h14"/></svg><span>${t.activo===false?"Activar":"Desactivar"}</span></button><button type="button" data-config-action="edit" class="is-primary" aria-label="Editar"><svg class="app-icon" viewBox="0 0 24 24"><path d="m4 20 4.5-1 9.8-9.8-3.5-3.5L5 15.5 4 20ZM13.8 6.7l3.5 3.5"/></svg><span>Editar</span></button></div></article>`).join(""):'<div class="tareas-empty config-tasks-empty"><span class="tareas-empty-icon"><svg class="app-icon" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 9h6M9 14h6"/></svg></span><strong>Sin tareas configuradas</strong><span>Agregá la primera tarea de ${esc(sel.value||"este sector")}.</span></div>';
  const cfg=configBano(); renderParticipantesConfig(cfg.participantes); $("banoIntervalo").value=cfg.intervalo||2; $("banoFechaInicio").value=cfg.fechaInicio||iso(new Date());
}
function guardarConfigBano(){ const participantes=participantesConfigActuales(); guardarJSON(BANO_KEY,{participantes,intervalo:Math.max(1,Number($("banoIntervalo").value)||2),fechaInicio:$("banoFechaInicio").value||iso(new Date())}); window.AutoservicioDialog?.alert?.({title:"Configuración guardada",message:"La rotación del baño se actualizó correctamente."}); renderParticipantesConfig(participantes); renderBano(); }

async function cambiarSector(){ const opts=sectoresPermitidos().map(s=>({value:s,label:s})); if(window.AppChoicePicker?.open){const v=await window.AppChoicePicker.open({title:"Seleccionar sector",kicker:"Tareas",value:sectorSeleccionado,options:opts});if(v){sectorSeleccionado=v;renderTareas();}} else { const v=prompt("Sector",sectorSeleccionado); if(v){sectorSeleccionado=v;renderTareas();} } }
function cambiarVista(v){ vistaActual=v; document.querySelectorAll("[data-tareas-view]").forEach(x=>{const visible=x.dataset.tareasView===v;x.classList.toggle("oculto",!visible);x.setAttribute("aria-hidden",visible?"false":"true");}); document.querySelectorAll("[data-tareas-tab]").forEach(x=>{const activo=x.dataset.tareasTab===v;x.classList.toggle("activo",activo);x.setAttribute("aria-current",activo?"page":"false");}); if(v==="tareas")renderTareas(); if(v==="bano")renderBano(); if(v==="config")renderConfig(); requestAnimationFrame(()=>window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})); }

function bind(){
  $("btnTareasSemanaAnterior").onclick=()=>{semanaBase.setDate(semanaBase.getDate()-7);fechaSeleccionada=new Date(semanaBase);renderTareas();};
  $("btnTareasSemanaSiguiente").onclick=()=>{semanaBase.setDate(semanaBase.getDate()+7);fechaSeleccionada=new Date(semanaBase);renderTareas();};
  $("btnTareasSemanaActual").onclick=()=>{fechaSeleccionada=inicioDia(new Date());semanaBase=inicioSemana(fechaSeleccionada);renderTareas();};
  $("btnTareasCambiarSector").onclick=cambiarSector; $("btnNuevaTarea").onclick=()=>abrir(); $("btnConfigNuevaTarea").onclick=()=>{sectorSeleccionado=$("configSectorFiltro").value||sectorSeleccionado;abrir();};
  $("btnCerrarTareaModal").onclick=$("btnCancelarTarea").onclick=cerrar; $("btnGuardarTarea").onclick=guardarForm; $("tareaRepetir").onchange=actualizarDiasRepeticion; $("btnEliminarTarea").onclick=eliminarTareaActual; $("tareaModal").onclick=e=>{if(e.target.id==="tareaModal")cerrar();};
  $("tareasLista").onclick=e=>{const card=e.target.closest(".tarea-card"), btn=e.target.closest("button[data-accion]");if(!card)return;if(btn){cambiarEstado(card.dataset.id,btn.dataset.accion,iso(fechaSeleccionada));return;}if(puedeGestionar())abrir(leer().find(x=>x.id===card.dataset.id));};
  document.querySelectorAll("[data-tareas-tab]").forEach(b=>b.onclick=()=>cambiarVista(b.dataset.tareasTab));
  $("configSectorFiltro").onchange=renderConfig; $("btnConfigCambiarSector").onclick=cambiarSectorConfig; $("btnGuardarConfigBano").onclick=guardarConfigBano;
  $("btnAgregarParticipanteBano").onclick=agregarParticipanteConfig; $("banoParticipanteNuevo").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();agregarParticipanteConfig();}};
  $("banoParticipantesChips").onclick=e=>{const btn=e.target.closest("[data-remove-participant]"), chip=e.target.closest("[data-participante]");if(!btn||!chip)return;renderParticipantesConfig(participantesConfigActuales().filter(x=>x!==chip.dataset.participante));};
  $("configTareasLista").onclick=e=>{const a=e.target.closest("button[data-config-action]"), row=e.target.closest("[data-id]");if(!a||!row)return;const all=leer(),t=all.find(x=>x.id===row.dataset.id);if(!t)return;if(a.dataset.configAction==="edit")abrir(t);else if(a.dataset.configAction==="delete"){confirmarEliminar(t);}else{t.activo=t.activo===false;guardar(all);renderConfig();renderTareas();}};
}
function activar(){activo=true;seed();normalizarSector();cambiarVista(vistaActual);}
function desactivar(){activo=false;cerrar();}
bind();window.TareasModule={activar,desactivar};
