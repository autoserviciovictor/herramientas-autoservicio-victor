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

function renderDias(){ const box=$("tareasDias"); if(!box)return; box.innerHTML=""; for(let i=0;i<7;i++){const d=new Date(semanaBase);d.setDate(d.getDate()+i);const b=document.createElement("button");b.type="button";b.className=iso(d)===iso(fechaSeleccionada)?"activo":"";b.innerHTML=`<strong>${DIAS[d.getDay()]}</strong><span>${d.getDate()}</span>`;b.onclick=()=>{fechaSeleccionada=d;renderTareas();};box.appendChild(b);} }
function renderResumen(items){ const n=s=>items.filter(t=>t.estado===s).length; $("tareasResumen").innerHTML=`<div><small>Total</small><strong>${items.length}</strong></div><div class="pend"><small>Pend.</small><strong>${n("pendiente")}</strong></div><div class="proc"><small>Proc.</small><strong>${n("proceso")}</strong></div><div class="comp"><small>Comp.</small><strong>${n("completada")}</strong></div>`; }
function renderLista(items){ const box=$("tareasLista"); if(!items.length){box.innerHTML='<div class="tareas-empty"><strong>Sin tareas para este día</strong><span>No hay tareas programadas para este sector.</span></div>';return;} box.innerHTML=items.map(t=>`<article class="tarea-card" data-id="${t.id}"><div class="tarea-card-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></div><div class="tarea-card-main"><h3>${esc(t.nombre)}</h3><span class="tarea-sector">${esc(t.sector||"General")}</span><div class="tarea-meta"><span class="turno-chip ${colorTurno(t.turno)}">${esc(t.turno)}</span><span class="tarea-persona">${esc(t.responsables)}</span><span>◷ ${esc(t.duracion||"Sin duración")}</span></div></div><div class="tarea-card-state estado-${t.estado}"><strong>${t.estado==="proceso"?"EN PROCESO":t.estado==="completada"?"✓ COMPLETADA":"PENDIENTE"}</strong>${t.estado==="completada"?`<small>${esc(t.completadaHora||"")}<br>por ${esc(t.completadaPor||"")}</small>`:`<button type="button" data-accion="${t.estado==="pendiente"?"iniciar":"completar"}">${t.estado==="pendiente"?"Confirmar":"Completar"}</button>`}</div></article>`).join(""); }
function renderTareas(){
  normalizarSector();
  const items=leer().filter(t=>t.activo!==false && t.fecha===iso(fechaSeleccionada) && (t.sector||"General")===sectorSeleccionado);
  $("tareasSectorNombre").textContent=sectorSeleccionado;
  $("btnTareasCambiarSector").classList.toggle("oculto",sectoresPermitidos().length<2);
  $("btnTareasSemanaActual").textContent=`${fmt(semanaBase,{day:"2-digit",month:"short"})} - ${fmt(new Date(semanaBase.getFullYear(),semanaBase.getMonth(),semanaBase.getDate()+6),{day:"2-digit",month:"short"})}`;
  $("tareasFechaTitulo").textContent=fmt(fechaSeleccionada,{weekday:"long",day:"numeric",month:"long"}).toUpperCase();
  $("btnNuevaTarea").classList.toggle("oculto",!puedeGestionar());
  renderDias();renderResumen(items);renderLista(items);
}
function cambiarEstado(id,accion){ const all=leer(), t=all.find(x=>x.id===id); if(!t)return; t.estado=accion==="iniciar"?"proceso":"completada"; if(t.estado==="completada"){const u=usuario();t.completadaPor=u.nombre||u.usuario||"Usuario";t.completadaHora=new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});} guardar(all);renderTareas(); }
function abrir(t=null){tareaEditando=t;normalizarSector();$("tareaModalTitulo").textContent=t?"Editar tarea":"Nueva tarea";$("tareaNombre").value=t?.nombre||"";$("tareaFecha").value=t?.fecha||iso(fechaSeleccionada);$("tareaDuracion").value=t?.duracion||"";$("tareaSector").value=t?.sector||sectorSeleccionado;$("tareaResponsables").value=t?.responsables||"";$("tareaTurno").value=t?.turno||"7:00 - 14:00";$("tareaDescripcion").value=t?.descripcion||"";$("tareaModal").classList.remove("oculto");$("tareaModal").setAttribute("aria-hidden","false");}
function cerrar(){$("tareaModal").classList.add("oculto");$("tareaModal").setAttribute("aria-hidden","true");}
function guardarForm(){const nombre=$("tareaNombre").value.trim();if(!nombre){window.AutoservicioDialog?.alert?.({title:"Falta el nombre",message:"Escribí el nombre de la tarea."});return;}const all=leer(), data={nombre,fecha:$("tareaFecha").value,sector:$("tareaSector").value.trim()||sectorSeleccionado,responsables:$("tareaResponsables").value.trim(),turno:$("tareaTurno").value,duracion:$("tareaDuracion").value.trim(),descripcion:$("tareaDescripcion").value.trim(),activo:true};if(tareaEditando){Object.assign(all.find(x=>x.id===tareaEditando.id),data);}else all.push({id:crypto.randomUUID?.()||String(Date.now()),...data,estado:"pendiente"});guardar(all);sectorSeleccionado=data.sector;cerrar();renderTareas();renderConfig();}

function configBano(){ return leerJSON(BANO_KEY,{participantes:[],intervalo:2,fechaInicio:iso(new Date())}); }
function indiceBano(fecha,cfg){ if(!cfg.participantes.length)return -1; const dias=Math.floor((inicioDia(fecha)-parseFecha(cfg.fechaInicio))/86400000); return ((Math.floor(dias/Math.max(1,Number(cfg.intervalo)||2))%cfg.participantes.length)+cfg.participantes.length)%cfg.participantes.length; }
function responsableBano(fecha,cfg){ const i=indiceBano(fecha,cfg); return i<0?"Sin participantes":cfg.participantes[i]; }
function renderBano(){
  const cfg=configBano(), hoy=inicioDia(new Date()), responsable=responsableBano(hoy,cfg), hist=leerJSON(BANO_HISTORY_KEY,[]);
  const confirmado=hist.find(h=>h.fecha===iso(hoy));
  $("banoTurnoActual").innerHTML=`<div class="bano-current-top"><span>HOY</span><strong>${fmt(hoy,{weekday:"long",day:"numeric",month:"long"})}</strong></div><div class="bano-person"><div class="bano-avatar">${esc(responsable.charAt(0).toUpperCase())}</div><div><small>Responsable</small><h3>${esc(responsable)}</h3></div></div>${confirmado?`<div class="bano-confirmed">✓ Confirmado a las ${esc(confirmado.hora)} por ${esc(confirmado.usuario)}</div>`:`<button id="btnConfirmarBano" class="save-btn" type="button" ${responsable==="Sin participantes"?"disabled":""}>Confirmar limpieza</button>`}`;
  const proximos=[]; for(let i=1;i<=5;i++){const d=new Date(hoy);d.setDate(d.getDate()+i*Math.max(1,Number(cfg.intervalo)||2));proximos.push({fecha:d,nombre:responsableBano(d,cfg)});} $("banoProximos").innerHTML=proximos.map(x=>`<article><div><strong>${fmt(x.fecha,{weekday:"long",day:"numeric",month:"short"})}</strong><span>${esc(x.nombre)}</span></div><span class="bano-day-badge">${x.fecha.getDate()}</span></article>`).join("")||'<div class="tareas-empty">Sin participantes configurados.</div>';
  $("banoHistorial").innerHTML=hist.slice().reverse().slice(0,5).map(h=>`<article><div><strong>${esc(h.usuario)}</strong><span>${fmt(parseFecha(h.fecha),{day:"numeric",month:"long"})}</span></div><small>${esc(h.hora)}</small></article>`).join("")||'<div class="tareas-empty"><strong>Sin confirmaciones</strong><span>Las limpiezas confirmadas aparecerán acá.</span></div>';
  $("btnConfirmarBano")?.addEventListener("click",confirmarBano);
}
function confirmarBano(){ const hist=leerJSON(BANO_HISTORY_KEY,[]), hoy=iso(new Date()); if(hist.some(h=>h.fecha===hoy))return; const u=usuario(), cfg=configBano(); hist.push({fecha:hoy,hora:new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}),usuario:u.nombre||u.usuario||responsableBano(new Date(),cfg)}); guardarJSON(BANO_HISTORY_KEY,hist); renderBano(); }

function renderConfig(){
  const permiso=puedeGestionar(); $("tareasConfigSinPermiso").classList.toggle("oculto",permiso); $("tareasConfigContenido").classList.toggle("oculto",!permiso); if(!permiso)return;
  const sectores=sectoresPermitidos(); const sel=$("configSectorFiltro"); const actual=sel.value||sectorSeleccionado||sectores[0]||"General"; sel.innerHTML=sectores.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join(""); sel.value=sectores.includes(actual)?actual:(sectores[0]||"");
  const lista=leer().filter(t=>(t.sector||"General")===sel.value); $("configTareasLista").innerHTML=lista.length?lista.map(t=>`<article data-id="${t.id}"><div><strong>${esc(t.nombre)}</strong><span>${esc(t.duracion||"Sin duración")} · ${esc(t.turno)}</span></div><div><button type="button" data-config-action="toggle">${t.activo===false?"Activar":"Desactivar"}</button><button type="button" data-config-action="edit">Editar</button></div></article>`).join(""):'<div class="tareas-empty"><strong>Sin tareas configuradas</strong><span>Agregá la primera tarea de este sector.</span></div>';
  const cfg=configBano(); $("banoParticipantes").value=cfg.participantes.join("\n"); $("banoIntervalo").value=cfg.intervalo||2; $("banoFechaInicio").value=cfg.fechaInicio||iso(new Date());
}
function guardarConfigBano(){ const participantes=$("banoParticipantes").value.split(/\n|,/).map(x=>x.trim()).filter(Boolean); guardarJSON(BANO_KEY,{participantes:[...new Set(participantes)],intervalo:Math.max(1,Number($("banoIntervalo").value)||2),fechaInicio:$("banoFechaInicio").value||iso(new Date())}); window.AutoservicioDialog?.alert?.({title:"Configuración guardada",message:"La rotación del baño se actualizó correctamente."}); renderBano(); }

async function cambiarSector(){ const opts=sectoresPermitidos().map(s=>({value:s,label:s})); if(window.AppChoicePicker?.open){const v=await window.AppChoicePicker.open({title:"Seleccionar sector",kicker:"Tareas",value:sectorSeleccionado,options:opts});if(v){sectorSeleccionado=v;renderTareas();}} else { const v=prompt("Sector",sectorSeleccionado); if(v){sectorSeleccionado=v;renderTareas();} } }
function cambiarVista(v){ vistaActual=v; document.querySelectorAll("[data-tareas-view]").forEach(x=>x.classList.toggle("oculto",x.dataset.tareasView!==v)); document.querySelectorAll("[data-tareas-tab]").forEach(x=>x.classList.toggle("activo",x.dataset.tareasTab===v)); if(v==="tareas")renderTareas(); if(v==="bano")renderBano(); if(v==="config")renderConfig(); }

function bind(){
  $("btnTareasSemanaAnterior").onclick=()=>{semanaBase.setDate(semanaBase.getDate()-7);fechaSeleccionada=new Date(semanaBase);renderTareas();};
  $("btnTareasSemanaSiguiente").onclick=()=>{semanaBase.setDate(semanaBase.getDate()+7);fechaSeleccionada=new Date(semanaBase);renderTareas();};
  $("btnTareasSemanaActual").onclick=()=>{fechaSeleccionada=inicioDia(new Date());semanaBase=inicioSemana(fechaSeleccionada);renderTareas();};
  $("btnTareasCambiarSector").onclick=cambiarSector; $("btnNuevaTarea").onclick=()=>abrir(); $("btnConfigNuevaTarea").onclick=()=>{sectorSeleccionado=$("configSectorFiltro").value||sectorSeleccionado;abrir();};
  $("btnCerrarTareaModal").onclick=$("btnCancelarTarea").onclick=cerrar; $("btnGuardarTarea").onclick=guardarForm; $("tareaModal").onclick=e=>{if(e.target.id==="tareaModal")cerrar();};
  $("tareasLista").onclick=e=>{const card=e.target.closest(".tarea-card"), btn=e.target.closest("button[data-accion]");if(!card)return;if(btn){cambiarEstado(card.dataset.id,btn.dataset.accion);return;}if(puedeGestionar())abrir(leer().find(x=>x.id===card.dataset.id));};
  document.querySelectorAll("[data-tareas-tab]").forEach(b=>b.onclick=()=>cambiarVista(b.dataset.tareasTab));
  $("configSectorFiltro").onchange=renderConfig; $("btnGuardarConfigBano").onclick=guardarConfigBano;
  $("configTareasLista").onclick=e=>{const a=e.target.closest("button[data-config-action]"), row=e.target.closest("[data-id]");if(!a||!row)return;const all=leer(),t=all.find(x=>x.id===row.dataset.id);if(!t)return;if(a.dataset.configAction==="edit")abrir(t);else{t.activo=t.activo===false;guardar(all);renderConfig();renderTareas();}};
}
function activar(){activo=true;seed();normalizarSector();cambiarVista(vistaActual);}
function desactivar(){activo=false;cerrar();}
bind();window.TareasModule={activar,desactivar};
