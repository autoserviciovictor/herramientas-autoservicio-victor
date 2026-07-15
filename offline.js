import { API_BASE_URL } from "./config.js?v=520";
const COLA="av_offline_queue_v1", CACHE="av_api_cache_v1";
let sincronizando=false, deferredInstallPrompt=null;
const leer=(k,def)=>{try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(def));}catch{return def;}};
const guardar=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const id=()=>`op-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
const url=r=>`${String(API_BASE_URL||"").replace(/\/$/,"")}${r}`;
function emitir(){window.dispatchEvent(new CustomEvent("offline-queue-change",{detail:{pendientes:leer(COLA,[]).length,online:navigator.onLine}}));}
export function obtenerPendientes(){return leer(COLA,[]).length;}
export function estaOnline(){return navigator.onLine;}
export async function apiRequest(ruta, opciones={}){
  const metodo=String(opciones.method||"GET").toUpperCase(), escritura=metodo!=="GET";
  const operationId=opciones.operationId||id();
  const headers={"Content-Type":"application/json",...(opciones.headers||{})};
  if(escritura)headers["X-Operation-ID"]=operationId;
  const controlador=new AbortController(), timer=setTimeout(()=>controlador.abort(),15000);
  try{
    const r=await fetch(url(ruta),{...opciones,method:metodo,headers,signal:controlador.signal});
    const data=await r.json().catch(()=>null);
    if(!r.ok||!data?.ok)throw new Error(data?.mensaje||"No se pudo conectar");
    if(!escritura){const c=leer(CACHE,{});c[ruta]={fecha:Date.now(),data};guardar(CACHE,c);}
    return data;
  }catch(error){
    if(escritura&&(error?.name==="AbortError"||!navigator.onLine||error instanceof TypeError||/conectar|network|fetch/i.test(error.message))){
      const cola=leer(COLA,[]); cola.push({id:operationId,ruta,opciones:{method:metodo,body:opciones.body,headers:opciones.headers||{}},fecha:new Date().toISOString()}); guardar(COLA,cola); emitir();
      return {ok:true,offline:true,pendiente:true,mensaje:"Guardado sin conexión. Se sincronizará automáticamente."};
    }
    if(!escritura){const item=leer(CACHE,{})[ruta]; if(item)return {...item.data,offline:true,cache:true};}
    if(error?.name==="AbortError")throw new Error("El servidor tardó demasiado en responder");
    throw error instanceof Error?error:new Error("No se pudo conectar con el servidor");
  }finally{clearTimeout(timer);}
}
export async function sincronizarPendientes(){
  if(sincronizando||!navigator.onLine)return; sincronizando=true;
  try{let cola=leer(COLA,[]), restantes=[];for(const op of cola){try{await apiRequest(op.ruta,{...op.opciones,operationId:op.id});}catch{restantes.push(op);}}guardar(COLA,restantes);emitir();if(!restantes.length&&cola.length)window.dispatchEvent(new CustomEvent("offline-sync-complete"));}finally{sincronizando=false;}
}
export function inicializarOffline(){
  window.addEventListener("online",()=>{emitir();sincronizarPendientes();}); window.addEventListener("offline",emitir);
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstallPrompt=e;window.dispatchEvent(new Event("app-install-available"));});
  if("serviceWorker" in navigator)navigator.serviceWorker.register("./service-worker.js?v=520").catch(console.error);
  emitir();sincronizarPendientes();
}
export async function instalarApp(){if(!deferredInstallPrompt)return false;deferredInstallPrompt.prompt();const r=await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;return r.outcome==="accepted";}
