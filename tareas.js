const $ = id => document.getElementById(id);
const KEY = "autoservicio_tareas_v1";
const DIAS = ["DOM","LUN","MAR","MIÉ","JUE","VIE","SÁB"];
let fechaSeleccionada = inicioDia(new Date());
let semanaBase = inicioSemana(fechaSeleccionada);
let tareaEditando = null;
let activo = false;

function inicioDia(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function inicioSemana(d){ const x=inicioDia(d), day=x.getDay(); x.setDate(x.getDate()-(day===0?6:day-1)); return x; }
function iso(d){ return d.toISOString().slice(0,10); }
function fmt(d,opt={}){ return new Intl.DateTimeFormat("es-AR",opt).format(d); }
function leer(){ try{return JSON.parse(localStorage.getItem(KEY)||"[]");}catch{return [];} }
function guardar(v){ localStorage.setItem(KEY,JSON.stringify(v)); }
function usuario(){ return window.AutoservicioAuth?.getUsuario?.() || window.AutoservicioAuth?.usuarioActual?.() || {}; }
function puedeGestionar(){ return ["administrador","supervisor"].includes(usuario()?.rol); }
function seed(){ if(leer().length) return; const hoy=inicioDia(new Date()), lunes=inicioSemana(hoy); const datos=[
["Limpieza panera","Panadería","Camila","7:00 - 14:00","10 min",0],
["Envasar pan","Panadería","Camila, Cynthia","8:00 - 15:00","45 min",0],
["Barrer vereda","Limpieza","Cynthia, Sofia","15:00 - 22:00","20/30 min",0],
["Limpieza de vidrios, marcos y puertas","Limpieza","Yuliana","8:00 - 15:00","20/30 min",0],
["Limpieza y orden de cajas","Caja","Camila, Sofia","7:00 - 14:00","15 min",0]
]; guardar(datos.map((x,i)=>({id:crypto.randomUUID?.()||String(Date.now()+i),nombre:x[0],sector:x[1],responsables:x[2],turno:x[3],duracion:x[4],fecha:iso(new Date(lunes.getFullYear(),lunes.getMonth(),lunes.getDate()+x[5])),estado:i===1?"proceso":i===2||i===3?"completada":"pendiente",descripcion:"",completadaPor:i>1?x[2].split(',')[0]:"",completadaHora:i>1?"14:18":""}))); }
function colorTurno(t){ return t.startsWith("7:")?"turno-manana":t.startsWith("8:")?"turno-tarde":"turno-noche"; }
function renderDias(){ const box=$("tareasDias"); if(!box)return; box.innerHTML=""; for(let i=0;i<7;i++){const d=new Date(semanaBase);d.setDate(d.getDate()+i);const b=document.createElement("button");b.type="button";b.className=iso(d)===iso(fechaSeleccionada)?"activo":"";b.innerHTML=`<strong>${DIAS[d.getDay()]}</strong><span>${d.getDate()}</span>`;b.onclick=()=>{fechaSeleccionada=d;render();};box.appendChild(b);} }
function renderResumen(items){ const n=s=>items.filter(t=>t.estado===s).length; $("tareasResumen").innerHTML=`<div><small>Total</small><strong>${items.length}</strong></div><div class="pend"><small>Pend.</small><strong>${n("pendiente")}</strong></div><div class="proc"><small>Proc.</small><strong>${n("proceso")}</strong></div><div class="comp"><small>Comp.</small><strong>${n("completada")}</strong></div>`; }
function renderLista(items){ const box=$("tareasLista"); if(!items.length){box.innerHTML='<div class="tareas-empty"><strong>Sin tareas para este día</strong><span>La planificación está libre.</span></div>';return;} box.innerHTML=items.map(t=>`<article class="tarea-card" data-id="${t.id}"><div class="tarea-card-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></div><div class="tarea-card-main"><h3>${esc(t.nombre)}</h3><span class="tarea-sector">${esc(t.sector||"General")}</span><div class="tarea-meta"><span class="turno-chip ${colorTurno(t.turno)}">${esc(t.turno)}</span><span class="tarea-persona">${esc(t.responsables)}</span><span>◷ ${esc(t.duracion||"Sin duración")}</span></div></div><div class="tarea-card-state estado-${t.estado}"><strong>${t.estado==="proceso"?"EN PROCESO":t.estado==="completada"?"✓ COMPLETADA":"PENDIENTE"}</strong>${t.estado==="completada"?`<small>${esc(t.completadaHora||"")}<br>por ${esc(t.completadaPor||"")}</small>`:`<button type="button" data-accion="${t.estado==="pendiente"?"iniciar":"completar"}">${t.estado==="pendiente"?"Confirmar":"Completar"}</button>`}</div></article>`).join(""); }
function esc(v){const d=document.createElement('div');d.textContent=v||'';return d.innerHTML;}
function render(){ if(!activo)return; const todos=leer(), items=todos.filter(t=>t.fecha===iso(fechaSeleccionada)); $("tareasWeekLabel"); $("btnTareasSemanaActual").textContent=`${fmt(semanaBase,{day:"2-digit",month:"short"})} - ${fmt(new Date(semanaBase.getFullYear(),semanaBase.getMonth(),semanaBase.getDate()+6),{day:"2-digit",month:"short"})}`; $("tareasFechaTitulo").textContent=fmt(fechaSeleccionada,{weekday:"long",day:"numeric",month:"long"}).toUpperCase(); $("btnNuevaTarea").classList.toggle("oculto",!puedeGestionar()); renderDias();renderResumen(items);renderLista(items); }
function cambiarEstado(id,accion){ const all=leer(), t=all.find(x=>x.id===id); if(!t)return; t.estado=accion==="iniciar"?"proceso":"completada"; if(t.estado==="completada"){const u=usuario();t.completadaPor=u.nombre||u.usuario||"Usuario";t.completadaHora=new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});} guardar(all);render(); }
function abrir(t=null){tareaEditando=t;$("tareaModalTitulo").textContent=t?"Editar tarea":"Nueva tarea";$("tareaNombre").value=t?.nombre||"";$("tareaFecha").value=t?.fecha||iso(fechaSeleccionada);$("tareaDuracion").value=t?.duracion||"";$("tareaSector").value=t?.sector||"";$("tareaResponsables").value=t?.responsables||"";$("tareaTurno").value=t?.turno||"7:00 - 14:00";$("tareaDescripcion").value=t?.descripcion||"";$("tareaModal").classList.remove("oculto");$("tareaModal").setAttribute("aria-hidden","false");}
function cerrar(){$("tareaModal").classList.add("oculto");$("tareaModal").setAttribute("aria-hidden","true");}
function guardarForm(){const nombre=$("tareaNombre").value.trim();if(!nombre){window.AutoservicioDialog?.alert?.({title:"Falta el nombre",message:"Escribí el nombre de la tarea."});return;}const all=leer(), data={nombre,fecha:$("tareaFecha").value,sector:$("tareaSector").value.trim(),responsables:$("tareaResponsables").value.trim(),turno:$("tareaTurno").value,duracion:$("tareaDuracion").value.trim(),descripcion:$("tareaDescripcion").value.trim()};if(tareaEditando){Object.assign(all.find(x=>x.id===tareaEditando.id),data);}else all.push({id:crypto.randomUUID?.()||String(Date.now()),...data,estado:"pendiente"});guardar(all);cerrar();render();}
function bind(){$("btnTareasSemanaAnterior").onclick=()=>{semanaBase.setDate(semanaBase.getDate()-7);fechaSeleccionada=new Date(semanaBase);render();};$("btnTareasSemanaSiguiente").onclick=()=>{semanaBase.setDate(semanaBase.getDate()+7);fechaSeleccionada=new Date(semanaBase);render();};$("btnTareasSemanaActual").onclick=$("btnTareasHoy").onclick=()=>{fechaSeleccionada=inicioDia(new Date());semanaBase=inicioSemana(fechaSeleccionada);render();};$("btnNuevaTarea").onclick=()=>abrir();$("btnCerrarTareaModal").onclick=$("btnCancelarTarea").onclick=cerrar;$("btnGuardarTarea").onclick=guardarForm;$("tareaModal").onclick=e=>{if(e.target.id==="tareaModal")cerrar();};$("tareasLista").onclick=e=>{const card=e.target.closest(".tarea-card"), btn=e.target.closest("button[data-accion]");if(!card)return;if(btn){cambiarEstado(card.dataset.id,btn.dataset.accion);return;}if(puedeGestionar())abrir(leer().find(x=>x.id===card.dataset.id));};}
function activar(){activo=true;seed();render();}
function desactivar(){activo=false;cerrar();}
bind();window.TareasModule={activar,desactivar};
