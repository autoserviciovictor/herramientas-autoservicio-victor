/* Sincronización de Proveedores/Pedidos/Cronograma con PostgreSQL.
 * No elimina datos locales ante errores de red. Conserva copias antes de migrar. */
(()=>{'use strict';
const groups={
  proveedores:'autoservicio_proveedores_v1',
  pedidos:'autoservicio_pedidos_proveedores_v1',
  cronograma:'autoservicio_cronograma_semanal_v1',
  colores:'autoservicio_cronograma_colores_v1'
};
const revisions={}, pending=new Set(), busy=new Set(), queued={};
let initialized=false;
const parse=(key)=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
const backup=(name,value)=>{try{localStorage.setItem('respaldo_sync_'+name+'_'+new Date().toISOString(),JSON.stringify(value))}catch(e){console.warn('No se pudo crear respaldo:',e)}};
const asList=(value)=>Array.isArray(value)?value:[];
const listFrom=(name,value)=>name==='colores'?(value&&typeof value==='object'&&!Array.isArray(value)?[value]:[]):asList(value);
const fromList=(name,list)=>name==='colores'?(list[0]||{}):list;
async function request(name,method='GET',body){
  const token=window.AutoservicioAuth?.getToken?.();
  if(!token)throw new Error('Iniciá sesión para sincronizar proveedores.');
  const base=window.API_BASE_URL;
  if(!base)throw new Error('La dirección del servidor no está disponible.');
  const r=await fetch(`${base}/proveedores/compartidos/${name}`,{method,cache:'no-store',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),Authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})});
  const result=await r.json().catch(()=>({}));
  if(!r.ok||!result.ok)throw Object.assign(new Error(result.mensaje||'Error al sincronizar'),{status:r.status});
  return result;
}
function changed(name,list){
  const key=groups[name],current=parse(key),incoming=fromList(name,list);
  if(JSON.stringify(current)!==JSON.stringify(incoming)){
    if(current!==null)backup(name,current);
    localStorage.setItem(key,JSON.stringify(incoming));
    window.dispatchEvent(new CustomEvent('proveedores:sincronizados',{detail:{coleccion:name}}));
    if(document.getElementById('provApp')&&!document.querySelector('#provOrderForm,#provForm,#cr-schedule-form')){
      clearTimeout(window.__proveedoresReload);window.__proveedoresReload=setTimeout(()=>location.reload(),800);
    }
  }
}
async function load(name,allowImport=false){
  if(busy.has(name)||pending.has(name))return;
  busy.add(name);
  try{
    const remote=await request(name);
    const local=listFrom(name,parse(groups[name]));
    const records=asList(remote.registros);
    revisions[name]=remote.revision;
    if(allowImport&&local.length){
      const ids=new Set(records.map(x=>String(x?.id||'')));
      const missing=name==='colores'?(records.length?[]:local):local.filter(x=>x?.id&&!ids.has(String(x.id)));
      if(missing.length&&window.confirm(`Hay ${missing.length} registro(s) de ${name} guardados solamente en esta computadora. ¿Querés incorporarlos al servidor compartido? Se conservará un respaldo local.`)){
        backup(name,parse(groups[name]));
        const merged=[...records,...missing];
        const result=await request(name,'PUT',{revision:remote.revision,registros:merged});
        revisions[name]=result.revision;
        changed(name,merged);
        return;
      }
    }
    changed(name,records);
  }catch(e){console.warn('Sincronización '+name+':',e.message);if(e.status===401||e.status===403)console.warn('Verificá sesión y permiso Proveedores.');}
  finally{busy.delete(name)}
}
async function save(name,value){
  if(!initialized)return;
  if(pending.has(name)){queued[name]=value;return;}
  pending.add(name);
  try{
    if(revisions[name]===undefined){const remote=await request(name);revisions[name]=remote.revision;
      if(remote.revision>0){throw new Error('No se había cargado la versión del servidor. Actualizá antes de guardar.')}}
    const result=await request(name,'PUT',{revision:revisions[name],registros:listFrom(name,value)});
    revisions[name]=result.revision;
  }catch(e){
    backup(name,value);
    console.error('No se guardaron los datos compartidos de '+name,e);
    alert(`No se pudo sincronizar ${name}: ${e.message}. Los datos quedaron respaldados en este navegador. No borres los datos locales.`);
  }finally{pending.delete(name);if(Object.prototype.hasOwnProperty.call(queued,name)){const next=queued[name];delete queued[name];save(name,next)}}
}
async function start(){
  if(initialized||!window.AutoservicioAuth?.getToken?.())return;
  initialized=true;
  for(const name of Object.keys(groups))await load(name,true);
  setInterval(()=>{if(!document.hidden)for(const name of Object.keys(groups))load(name)},20000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)for(const name of Object.keys(groups))load(name)});
}
window.ProveedoresSync={start,save,refresh:()=>Promise.all(Object.keys(groups).map(n=>load(n)))};
window.addEventListener('load',()=>{setTimeout(start,1000);setInterval(start,5000)});
})();
