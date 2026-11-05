/* Sincronización segura: nunca descarta datos locales no migrados.
 * Recuperación manual desde localStorage y respaldos respaldo_sync_*.
 */
(()=>{'use strict';
const groups={proveedores:'autoservicio_proveedores_v1',pedidos:'autoservicio_pedidos_proveedores_v1',cronograma:'autoservicio_cronograma_semanal_v1',colores:'autoservicio_cronograma_colores_v1'};
const revisions={},pending=new Set(),busy=new Set(),queued={};
// Última copia confirmada del servidor, para detectar ediciones locales aún pendientes.
const confirmedSnapshots={};
const writeStatus={};
function report(n,state,message=''){
  writeStatus[n]={state,message,at:new Date().toISOString()};
  window.dispatchEvent(new CustomEvent('proveedores:estado-guardado',{detail:{coleccion:n,...writeStatus[n]}}));
  let el=document.getElementById('proveedores-estado-guardado');
  if(!el){el=document.createElement('div');el.id='proveedores-estado-guardado';el.setAttribute('role','status');el.style.cssText='position:fixed;bottom:12px;left:12px;z-index:2147483646;max-width:360px;padding:9px 13px;border-radius:9px;box-shadow:0 3px 16px #0003;font:13px/1.4 Arial,sans-serif';document.body?.appendChild(el)}
  const outstanding=Object.entries(writeStatus).filter(([,v])=>v.state!=='confirmed');
  if(!outstanding.length){el.textContent='Cambios confirmados en PostgreSQL';el.style.background='#e7f5ec';el.style.color='#155b30';return}
  el.textContent=outstanding.map(([key,v])=>key+': '+(v.state==='saving'?'guardando en PostgreSQL…':'SIN CONFIRMAR en PostgreSQL — '+v.message)).join(' | ');
  el.style.background=outstanding.some(([,v])=>v.state==='failed')?'#fff0e8':'#fff8db';el.style.color='#653000';
}
let initialized=false,recovering=false,notice=null,progress=null;
const parseText=s=>{try{return JSON.parse(s)}catch{return null}};
const parse=k=>parseText(localStorage.getItem(k));
const asList=v=>Array.isArray(v)?v:[];
const listFrom=(n,v)=>n==='colores'?(v&&typeof v==='object'&&!Array.isArray(v)?[v]:[]):asList(v);
const fromList=(n,v)=>n==='colores'?(v[0]||{}):v;
const backup=(n,v)=>{try{localStorage.setItem('respaldo_sync_'+n+'_'+new Date().toISOString(),JSON.stringify(v))}catch(e){console.warn('Respaldo:',e)}};
const idOf=x=>x&&x.id!=null?String(x.id):'';
// Los registros antiguos pueden carecer de id: conservarlos por huella de contenido.
const canonical=x=>{
  if(Array.isArray(x))return x.map(canonical);
  if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));
  return x;
};
const equalRecord=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const identity=x=>idOf(x)?'id:'+idOf(x):'contenido:'+JSON.stringify(canonical(x));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function localCandidates(n){
  const items=[{key:groups[n],value:parse(groups[n])}];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k&&k.startsWith('respaldo_sync_'+n+'_'))items.push({key:k,value:parse(k)});
  }
  return items.filter(x=>x.value!==null);
}
function localMerged(n){
  const candidates=localCandidates(n);
  if(n==='colores'){
    const current=candidates.find(x=>x.key===groups[n]&&x.value&&Object.keys(x.value).length);
    return listFrom(n,current?.value||candidates.find(x=>x.value&&Object.keys(x.value).length)?.value);
  }
  const map=new Map();
  // Backups primero; el valor local actual prevalece para el mismo ID.
  for(const candidate of [...candidates.filter(x=>x.key!==groups[n]),...candidates.filter(x=>x.key===groups[n])]){
    for(const record of asList(candidate.value)){if(record&&typeof record==='object')map.set(identity(record),record)}
  }
  return [...map.values()];
}
function missing(n,remote){
  const local=localMerged(n);
  if(n==='colores')return remote.length?[]:local;
  const ids=new Set(remote.map(identity));
  return local.filter(x=>!ids.has(identity(x)));
}
async function request(n,method='GET',body){
  const token=window.AutoservicioAuth?.getToken?.();
  if(!token)throw new Error('Iniciá sesión para sincronizar proveedores.');
  const base=window.API_BASE_URL;
  if(!base)throw new Error('No se encontró la dirección del servidor.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  let r;
  try{r=await fetch(`${base}/proveedores/compartidos/${n}`,{method,cache:'no-store',signal:controller.signal,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),Authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})});}
  catch(e){throw new Error(e.name==='AbortError'?'La API no respondió en 20 segundos. Revisá Render y volvé a intentar más tarde.':'No se pudo conectar con Render: '+e.message)}
  finally{clearTimeout(timeout)}
  const result=await r.json().catch(()=>({}));
  if(!r.ok||!result.ok){
    const hint=r.status===404?'La API de Render no tiene publicada la ruta de proveedores compartidos. Es necesario desplegar server.js y db-proveedores-compartidos.js en Render.':r.status===401||r.status===403?'La sesión no tiene autorización para sincronizar proveedores.':r.status===413?'El servidor rechazó el tamaño de los datos.':r.status>=500?'La API de Render tuvo un error interno; revisá sus logs.':'';
    throw Object.assign(new Error([result.mensaje||'Error de sincronización',hint,'HTTP '+r.status].filter(Boolean).join(' — ')),{status:r.status});
  }
  return result;
}
function exportRecovery(){
  const data={origen:location.origin,fecha:new Date().toISOString(),colecciones:{}};
  for(const n of Object.keys(groups))data.colecciones[n]=localCandidates(n);
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='respaldo-autoservicio-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function changed(n,list){
  const key=groups[n],current=parse(key),incoming=fromList(n,list);
  if(JSON.stringify(current)===JSON.stringify(incoming))return;
  if(current!==null)backup(n,current);
  localStorage.setItem(key,JSON.stringify(incoming));
  window.dispatchEvent(new CustomEvent('proveedores:sincronizados',{detail:{coleccion:n}}));
  // La vista recibe el evento y se actualiza sin recargar la aplicación.
}
function onProveedoresScreen(){return !!document.getElementById('provApp') && !!document.getElementById('provApp').offsetParent}
function showNotice(){
  if(!onProveedoresScreen()){hideNotice();return}
  if(notice||!document.body)return;
  notice=document.createElement('div');
  notice.id='recuperacion-proveedores-aviso';
  notice.style.cssText='position:fixed;z-index:2147483647;bottom:16px;right:16px;max-width:390px;padding:15px 17px;background:#fff;color:#17212b;border:2px solid #d48a1b;border-radius:12px;box-shadow:0 8px 35px #0005;font:14px/1.45 Arial,sans-serif';
  const msg=document.createElement('div');msg.textContent='Hay datos locales o respaldos que todavía no están en PostgreSQL. No se reemplazarán automáticamente.';
  const btn=document.createElement('button');btn.type='button';btn.textContent='Revisar y migrar datos';
  btn.style.cssText='display:block;margin-top:10px;padding:9px 14px;border:0;border-radius:7px;background:#1859a8;color:white;cursor:pointer;font-weight:bold';
  btn.addEventListener('click',recover);
  notice.append(msg,btn);document.body.appendChild(notice);
}
function hideNotice(){notice?.remove();notice=null}
function showProgress(message){
  if(!progress){progress=document.createElement('div');progress.id='proveedores-migracion-progreso';progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');progress.style.cssText='position:fixed;z-index:2147483647;top:22px;left:50%;transform:translateX(-50%);max-width:min(92vw,540px);background:#17335d;color:#fff;border-radius:12px;padding:17px 22px;box-shadow:0 12px 45px #0005;font:600 15px/1.5 Arial,sans-serif';document.body.appendChild(progress)}
  progress.textContent=message;
}
function hideProgress(){progress?.remove();progress=null}
async function load(n){
  if(recovering||busy.has(n)||pending.has(n)||individualBusy.has(n))return;
  busy.add(n);
  try{
    const remote=await request(n),records=asList(remote.registros);
    revisions[n]=remote.revision;
    // No reemplazar cambios actuales que aún no se guardaron.
    const currentValue=parse(groups[n]);
    const current=listFrom(n,currentValue);
    const remoteIds=new Set(records.map(identity));
    // Si el navegador cambió desde la última lectura confirmada, NO sustituirlo.
    // La comparación por IDs sola no detectaba ediciones de campos existentes.
    if(Object.prototype.hasOwnProperty.call(confirmedSnapshots,n) &&
       !equalRecord(currentValue,confirmedSnapshots[n])){
      report(n,'failed','Hay cambios locales sin confirmar; se conservan hasta sincronizarlos.');
      return;
    }
    if(current.some(x=>!remoteIds.has(identity(x)))){showNotice();return}
    // Los respaldos antiguos no bloquean la sincronización cotidiana.
    changed(n,records);
    confirmedSnapshots[n]=structuredClone(fromList(n,records));
  }catch(e){console.warn('Sincronización '+n+':',e.message)}
  finally{busy.delete(n)}
}
async function recover(){
  if(recovering)return;
  recovering=true;
  showProgress('Comprobando los datos locales y PostgreSQL…');
  try{
    const plan=[];
    for(const n of Object.keys(groups)){
      showProgress('Consultando '+n+' en PostgreSQL…');
      const remote=await request(n),extra=missing(n,asList(remote.registros));
      if(extra.length)plan.push({name:n,count:extra.length});
    }
    if(!plan.length){hideNotice();alert('No hay registros locales pendientes de migrar.');return}
    const summary=plan.map(x=>`${x.name}: ${x.count}`).join('\n');
    if(!confirm('Datos locales que faltan en PostgreSQL:\n\n'+summary+'\n\nSe intentará descargar primero una copia de los respaldos de este navegador. ¿Continuar?'))return;
    showProgress('Descargando respaldo local…');
    exportRecovery();
    hideProgress();
    if(!confirm('Se solicitó la descarga del respaldo local. Comprobá que se haya descargado antes de continuar.\n\n¿Iniciar ahora la migración?'))return;
    const results=[];
    for(const item of plan){
      showProgress('Migrando '+item.name+' ('+(results.length+1)+' de '+plan.length+'). No cierres esta pantalla…');
      const n=item.name;
      let verified=false,lastError='',verifiedRecords=null;
      // Una sola escritura por revisión. No repetir PUT si el servidor no confirma:
      // primero consultar su estado para evitar sobreescrituras o duplicados.
      for(let attempt=0;attempt<5&&!verified;attempt++){
        const remote=await request(n),records=asList(remote.registros),extra=missing(n,records);
        if(!extra.length){verified=true;revisions[n]=remote.revision;changed(n,records);break}
        if(attempt===0 || lastError.startsWith('Conflicto')){
          // Solo migrar registros ausentes; jamás reemplazar los que ya están en PostgreSQL.
          const currentLocal=parse(groups[n]);
          if(currentLocal!==null)backup(n,currentLocal);
          try{
            showProgress('Guardando '+n+' en PostgreSQL…');
            await request(n,'PUT',{revision:remote.revision,registros:[...records,...extra]});
          }catch(e){
            lastError=e.status===409?'Conflicto de revisión':`Escritura rechazada (${e.status||'red'}): ${e.message}`;
            if(e.status!==409){
              // Si falló la escritura, no repetir a ciegas: solo verificar lectura.
              console.error('Migración '+n,lastError);
            }
          }
        }
        for(let checkAttempt=0;checkAttempt<5;checkAttempt++){
          await sleep(600*(checkAttempt+1));
          showProgress('Verificando '+n+' en PostgreSQL (intento '+(checkAttempt+1)+'/5)…');
          const check=await request(n),saved=asList(check.registros);
          const ids=new Set(saved.map(identity));
          if(extra.every(x=>ids.has(identity(x)))){
            verified=true;verifiedRecords=saved;revisions[n]=check.revision;changed(n,saved);break;
          }
          lastError=lastError||`Persisten ${extra.filter(x=>!ids.has(identity(x))).length} registros sin verificar (servidor: ${saved.length})`;
        }
        if(!verified && !lastError.startsWith('Conflicto'))break;
      }
      if(!verified)throw new Error(`No se pudo completar ${n}: ${lastError}. No se eliminaron los respaldos.`);
      results.push(n+': '+item.count+' incorporados/verificados');
    }
    // Volver a revisar todas las colecciones, incluso si una migración anterior fue parcial.
    const pendientes=[];
    for(const n of Object.keys(groups)){
      const remote=await request(n),extra=missing(n,asList(remote.registros));
      if(extra.length)pendientes.push(n+': '+extra.length);
    }
    if(pendientes.length)throw new Error('Quedan registros pendientes: '+pendientes.join(', '));
    hideNotice();hideProgress();alert('Migración verificada:\n'+results.join('\n')+'\n\nLos respaldos locales se conservaron.');
  }catch(e){hideProgress();showNotice();alert('La migración NO quedó completamente verificada: '+e.message+'\n\nNo repitas el proceso hasta resolver el error. Los respaldos locales se conservaron.');console.error('Diagnóstico de migración de proveedores:',e)}
  finally{hideProgress();recovering=false;}
}
// Guarda sin descartar registros pendientes de migración ni sobrescribir una revisión antigua.
// Los datos remotos no incluidos en la vista local se conservan; los registros editados
// se aplican por ID. La confirmación requiere lectura posterior de PostgreSQL.
async function save(n,value){
  if(!initialized){
    // La inicialización puede estar esperando la sesión. Nunca perder la intención de guardar.
    queued[n]=value;
    report(n,'saving');
    void start();
    return false;
  }
  if(recovering||individualBusy.has(n)){queued[n]=value;report(n,'saving');return false}
  if(pending.has(n)){queued[n]=value;report(n,'saving');return false}
  pending.add(n);
  report(n,'saving');
  try{
    const submitted=listFrom(n,value);
    if(n!=='colores' && !Array.isArray(value))throw new Error('Formato de datos inválido.');
    // Conservar una copia del estado enviado antes de cualquier comunicación.
    backup(n,value);
    let verified=false,lastError='',verifiedRecords=null;
    for(let attempt=0;attempt<3&&!verified;attempt++){
      const remote=await request(n),records=asList(remote.registros);
      // Los respaldos históricos se usan SOLO en la recuperación manual.
      // Nunca reinsertarlos automáticamente al guardar un registro nuevo.
      let combined;
      if(n==='colores'){
        // No reemplazar una configuración remota con un objeto vacío.
        combined=submitted.length?submitted:records;
      }else{
        const map=new Map(records.map(x=>[identity(x),x]));
        // Mantener los registros del servidor y aplicar únicamente el estado
        // actual enviado por el módulo. Los respaldos no son datos activos.
        // Nota: las bajas requieren una operación explícita en el servidor;
        // esta combinación conservadora no interpreta ausencias como borrados.
        // La edición actual tiene prioridad sobre el registro remoto del mismo ID.
        for(const x of submitted)map.set(identity(x),x);
        combined=[...map.values()];
      }
      // Si la base ya contiene el estado solicitado, no generar otra revisión.
      const sameRecords=combined.length===records.length && combined.every(x=>{
        const actual=records.find(y=>identity(y)===identity(x));
        return actual&&equalRecord(actual,x);
      });
      if(!sameRecords)try{
        await request(n,'PUT',{revision:remote.revision,registros:combined});
      }catch(e){
        lastError=e.message;
        if(e.status===409)continue; // Otro dispositivo guardó primero: releer y combinar.
        // La petición puede haberse guardado aunque la respuesta haya fallado.
        // Verificar antes de considerar el guardado fallido.
      }
      const check=await request(n),saved=asList(check.registros);
      if(combined.every(x=>{
        const actual=saved.find(y=>identity(y)===identity(x));
        return actual&&equalRecord(actual,x);
      }) && submitted.every(x=>{
            const actual=saved.find(y=>identity(y)===identity(x));
            return actual&&equalRecord(actual,x);
          })){
        verified=true;verifiedRecords=saved;revisions[n]=check.revision;
        // Actualizar el almacenamiento local solo si no hubo otra edición posterior.
        if(!Object.prototype.hasOwnProperty.call(queued,n))changed(n,saved);
      }else lastError='El servidor no confirmó todos los registros guardados.';
    }
    if(!verified)throw new Error(lastError||'No se pudo verificar el guardado en PostgreSQL.');
    confirmedSnapshots[n]=structuredClone(fromList(n,verifiedRecords));
    report(n,'confirmed');
    // El aviso histórico no debe bloquear los nuevos pedidos.
    if(onProveedoresScreen()){
      try{const remote=await request(n);if(!missing(n,asList(remote.registros)).length)hideNotice();}
      catch(e){console.warn('No se pudo revisar aviso histórico:',e.message)}
    }
    return true;
  }catch(e){
    backup(n,value);
    console.error('Sincronización '+n,e);
    report(n,'failed',e.message+' (se conservó respaldo local)');
    return false;
  }finally{
    pending.delete(n);
    if(Object.prototype.hasOwnProperty.call(queued,n)){
      const next=queued[n];delete queued[n];
      void save(n,next);
    }
  }
}
// Etapa 8: operación individual, con confirmación de lectura del servidor.
// No se considera guardado ningún cambio que no se haya verificado en PostgreSQL.
const individualBusy=new Set();
async function mutateRecord(n,record,deleteId=null){
  if(!['proveedores','pedidos','cronograma'].includes(n))throw new Error('Colección no permitida');
  const id=deleteId===null?String(record?.id??''):String(deleteId);
  if(!id)throw new Error('El registro necesita un identificador');
  if(individualBusy.has(n)||pending.has(n)||recovering)throw new Error('Hay otra operación de sincronización en curso. Intentá nuevamente.');
  if(Object.prototype.hasOwnProperty.call(confirmedSnapshots,n) &&
     !equalRecord(parse(groups[n]),confirmedSnapshots[n])){
    throw new Error('Hay cambios locales pendientes de sincronización. No se aplicó otra operación para evitar pérdida de datos.');
  }
  individualBusy.add(n);report(n,'saving');
  try{
    const remote=await request(n);
    const existing=asList(remote.registros).find(x=>idOf(x)===id);
    // Una modificación no puede reemplazar silenciosamente una edición hecha en otra computadora.
    const base=Object.prototype.hasOwnProperty.call(confirmedSnapshots,n)?listFrom(n,confirmedSnapshots[n]):null;
    const old=base?.find(x=>idOf(x)===id);
    if(existing && (!old || !equalRecord(existing,old)))throw new Error('El registro cambió en PostgreSQL o no fue cargado desde el servidor. Actualizá los datos antes de modificarlo.');
    if(deleteId!==null&&!existing)throw new Error('El registro no existe en PostgreSQL. No se eliminó nada.');
    const method=deleteId!==null?'DELETE':'PUT';
    const endpoint=encodeURIComponent(id);
    const token=window.AutoservicioAuth?.getToken?.();
    const baseUrl=window.API_BASE_URL;
    if(!token||!baseUrl)throw new Error('No hay sesión o conexión con la API');
    const response=await fetch(`${baseUrl}/proveedores/compartidos/${n}/registros/${endpoint}`,{
      method,cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({revision:remote.revision,...(deleteId===null?{registro:record}:{})})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw new Error(result.mensaje||`PostgreSQL rechazó la operación (HTTP ${response.status})`);
    const verified=await request(n);
    const actual=asList(verified.registros).find(x=>idOf(x)===id);
    if(deleteId===null?!actual||!equalRecord(actual,record):!!actual)throw new Error('El servidor no confirmó el cambio en la lectura posterior. Revisá antes de reintentar.');
    revisions[n]=verified.revision;
    confirmedSnapshots[n]=structuredClone(fromList(n,asList(verified.registros)));
    changed(n,asList(verified.registros));
    report(n,'confirmed');
    return true;
  }catch(e){report(n,'failed',e.message);console.error('Operación individual '+n,e);throw e}
  finally{individualBusy.delete(n)}
}
async function start(){
  if(initialized||!window.AutoservicioAuth?.getToken?.())return;
  initialized=true;
  for(const n of Object.keys(groups))await load(n);
  for(const n of Object.keys(queued)){const value=queued[n];delete queued[n];void save(n,value)}
  setInterval(()=>{if(!document.hidden){if(!onProveedoresScreen())hideNotice();for(const n of Object.keys(groups))load(n)}},20000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)for(const n of Object.keys(groups))load(n)});
}
window.ProveedoresSync={start,save,mutateRecord,refresh:()=>Promise.all(Object.keys(groups).map(load)),recover,getWriteStatus:()=>structuredClone(writeStatus)};
window.addEventListener('load',()=>{setTimeout(start,1000);setInterval(start,5000)});
})();
