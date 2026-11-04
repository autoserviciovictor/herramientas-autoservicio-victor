/* Sincronización segura: nunca descarta datos locales no migrados.
 * Recuperación manual desde localStorage y respaldos respaldo_sync_*.
 */
(()=>{'use strict';
const groups={proveedores:'autoservicio_proveedores_v1',pedidos:'autoservicio_pedidos_proveedores_v1',cronograma:'autoservicio_cronograma_semanal_v1',colores:'autoservicio_cronograma_colores_v1'};
const revisions={},pending=new Set(),busy=new Set(),queued={};
let initialized=false,recovering=false,notice=null;
const parseText=s=>{try{return JSON.parse(s)}catch{return null}};
const parse=k=>parseText(localStorage.getItem(k));
const asList=v=>Array.isArray(v)?v:[];
const listFrom=(n,v)=>n==='colores'?(v&&typeof v==='object'&&!Array.isArray(v)?[v]:[]):asList(v);
const fromList=(n,v)=>n==='colores'?(v[0]||{}):v;
const backup=(n,v)=>{try{localStorage.setItem('respaldo_sync_'+n+'_'+new Date().toISOString(),JSON.stringify(v))}catch(e){console.warn('Respaldo:',e)}};
const idOf=x=>x&&x.id!=null?String(x.id):'';
// Los registros antiguos pueden carecer de id: conservarlos por huella de contenido.
const identity=x=>idOf(x)?'id:'+idOf(x):'contenido:'+JSON.stringify(x);
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
  const r=await fetch(`${base}/proveedores/compartidos/${n}`,{method,cache:'no-store',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),Authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})});
  const result=await r.json().catch(()=>({}));
  if(!r.ok||!result.ok)throw Object.assign(new Error(result.mensaje||'Error de sincronización'),{status:r.status});
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
  if(document.getElementById('provApp')&&!document.querySelector('#provOrderForm,#provForm,#cr-schedule-form')){
    clearTimeout(window.__proveedoresReload);
    window.__proveedoresReload=setTimeout(()=>location.reload(),900);
  }
}
function showNotice(){
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
async function load(n){
  if(recovering||busy.has(n)||pending.has(n))return;
  busy.add(n);
  try{
    const remote=await request(n),records=asList(remote.registros);
    revisions[n]=remote.revision;
    if(missing(n,records).length){showNotice();return} // No sobrescribir datos no migrados.
    changed(n,records);
  }catch(e){console.warn('Sincronización '+n+':',e.message)}
  finally{busy.delete(n)}
}
async function recover(){
  if(recovering)return;
  recovering=true;
  try{
    const plan=[];
    for(const n of Object.keys(groups)){
      const remote=await request(n),extra=missing(n,asList(remote.registros));
      if(extra.length)plan.push({name:n,count:extra.length});
    }
    if(!plan.length){hideNotice();alert('No hay registros locales pendientes de migrar.');return}
    const summary=plan.map(x=>`${x.name}: ${x.count}`).join('\n');
    if(!confirm('Datos locales que faltan en PostgreSQL:\n\n'+summary+'\n\nSe intentará descargar primero una copia de los respaldos de este navegador. ¿Continuar?'))return;
    exportRecovery();
    if(!confirm('Se solicitó la descarga del respaldo local. Comprobá que se haya descargado antes de continuar.\n\n¿Iniciar ahora la migración?'))return;
    const results=[];
    for(const item of plan){
      const n=item.name;
      let verified=false,lastError='';
      for(let attempt=0;attempt<6&&!verified;attempt++){
        const remote=await request(n),records=asList(remote.registros),extra=missing(n,records);
        if(!extra.length){verified=true;revisions[n]=remote.revision;changed(n,records);break}
        // Conservar el estado previo, sin sustituir datos ya presentes en el servidor.
        backup(n,parse(groups[n]));
        const merged=[...records,...extra];
        try{
          await request(n,'PUT',{revision:remote.revision,registros:merged});
        }catch(e){
          lastError=e.message;
          // Una respuesta fallida puede haber ocurrido DESPUÉS de guardar. Volver a leer.
          if(e.status!==409)console.warn('Migración '+n+' intento '+(attempt+1),e);
        }
        // En Render la lectura inmediatamente posterior puede demorar; verificar sin reescribir.
        for(let checkAttempt=0;checkAttempt<4;checkAttempt++){
          await sleep(400*(checkAttempt+1));
          const check=await request(n),saved=asList(check.registros);
          const ids=new Set(saved.map(identity));
          if(extra.every(x=>ids.has(identity(x)))){
            verified=true;revisions[n]=check.revision;changed(n,saved);break;
          }
          lastError='El servidor devolvió '+saved.length+' registros; aún faltan '+extra.filter(x=>!ids.has(identity(x))).length;
        }
        if(!verified)await sleep(800*(attempt+1));
      }
      if(!verified)throw new Error('No se pudo verificar '+n+'. '+lastError+'. No vuelvas a intentar sin revisar el estado del servidor.');
      results.push(n+': '+item.count+' incorporados/verificados');
    }
    // Volver a revisar todas las colecciones, incluso si una migración anterior fue parcial.
    const pendientes=[];
    for(const n of Object.keys(groups)){
      const remote=await request(n),extra=missing(n,asList(remote.registros));
      if(extra.length)pendientes.push(n+': '+extra.length);
    }
    if(pendientes.length)throw new Error('Quedan registros pendientes: '+pendientes.join(', '));
    hideNotice();alert('Migración verificada:\n'+results.join('\n')+'\n\nLos respaldos locales se conservaron.');
  }catch(e){showNotice();alert('La migración NO quedó completamente verificada: '+e.message+'\nSe conservaron los respaldos locales.');console.error(e)}
  finally{recovering=false}
}
async function save(n,value){
  if(!initialized||recovering)return;
  if(pending.has(n)){queued[n]=value;return}
  pending.add(n);
  try{
    // No publicar una lista local incompleta sobre datos remotos o respaldados.
    const remote=await request(n),records=asList(remote.registros);
    if(missing(n,records).length){showNotice();throw new Error('Hay datos locales pendientes de migración. Usá «Revisar y migrar datos» antes de guardar.')}
    if(n!=='colores'){
      const submitted=asList(value),submittedIds=new Set(submitted.map(idOf));
      if(records.some(x=>idOf(x)&&!submittedIds.has(idOf(x)))){
        throw new Error('El servidor tiene registros ausentes en esta pantalla. Actualizá la información antes de guardar.');
      }
    }
    const result=await request(n,'PUT',{revision:remote.revision,registros:listFrom(n,value)});
    revisions[n]=result.revision;
  }catch(e){backup(n,value);console.error('Sincronización '+n,e);alert('No se pudo sincronizar '+n+': '+e.message+' Los datos quedaron respaldados en este navegador.')}
  finally{pending.delete(n);if(Object.prototype.hasOwnProperty.call(queued,n)){const next=queued[n];delete queued[n];save(n,next)}}
}
async function start(){
  if(initialized||!window.AutoservicioAuth?.getToken?.())return;
  initialized=true;
  for(const n of Object.keys(groups))await load(n);
  setInterval(()=>{if(!document.hidden)for(const n of Object.keys(groups))load(n)},20000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)for(const n of Object.keys(groups))load(n)});
}
window.ProveedoresSync={start,save,refresh:()=>Promise.all(Object.keys(groups).map(load)),recover};
window.addEventListener('load',()=>{setTimeout(start,1000);setInterval(start,5000)});
})();
