import { API_BASE_URL } from "./config.js?v=1210";
const $ = id => document.getElementById(id);
let notificaciones = [];
function icono(tipo="") { if (tipo.includes("tarea")) return "✓"; if (tipo.includes("bano")) return "♨"; if (tipo.includes("venc")) return "⚠"; return "🔔"; }
function formatearFecha(valor="") { const d=new Date(valor); if (Number.isNaN(d.getTime())) return valor; return new Intl.DateTimeFormat("es-AR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(d); }
function render() {
  const lista=$("notificationCenterList"), badge=$("menuNotificacionesBadge"); if(!lista) return;
  const noLeidas=notificaciones.filter(n=>!n.leida).length;
  if(badge){ badge.textContent=String(noLeidas); badge.classList.toggle("oculto",!noLeidas); }
  $("notificationCenterCount").textContent=`${notificaciones.length} notificaciones`;
  if(!notificaciones.length){ lista.innerHTML=`<div class="notification-empty"><div>🔔</div><strong>No tenés notificaciones</strong><span>Cuando haya novedades aparecerán aquí.</span></div>`; return; }
  lista.innerHTML=notificaciones.map(n=>`<button type="button" class="notification-item ${n.leida?'is-read':'is-unread'}" data-id="${n.id}" data-url="${encodeURIComponent(n.url||'./')}"><span class="notification-item-icon">${icono(n.tipo)}</span><span class="notification-item-copy"><strong>${n.titulo||'Notificación'}</strong><span>${n.mensaje||''}</span><small>${formatearFecha(n.fecha)}</small></span>${n.leida?'':'<i aria-label="Nueva"></i>'}</button>`).join("");
}
async function cargar(){ try{ const r=await fetch(`${API_BASE_URL}/notificaciones/centro`); const d=await r.json(); if(r.ok&&d.ok){notificaciones=d.notificaciones||[];render();}}catch{} }
async function marcar(id){ await fetch(`${API_BASE_URL}/notificaciones/centro/${encodeURIComponent(id)}/leida`,{method:'PATCH'}).catch(()=>{}); const n=notificaciones.find(x=>x.id===id); if(n)n.leida=true; render(); }
function abrir(){ $("userDropdown")?.classList.add("oculto"); const o=$("notificationCenterOverlay"); o?.classList.remove("oculto"); o?.setAttribute("aria-hidden","false"); document.body.classList.add("modal-open"); cargar(); }
function cerrar(){ const o=$("notificationCenterOverlay"); o?.classList.add("oculto"); o?.setAttribute("aria-hidden","true"); document.body.classList.remove("modal-open"); }
document.addEventListener('DOMContentLoaded',()=>{
  $("btnMenuNotificaciones")?.addEventListener('click',abrir); $("btnCerrarNotificationCenter")?.addEventListener('click',cerrar);
  $("notificationCenterOverlay")?.addEventListener('click',e=>{if(e.target===$("notificationCenterOverlay"))cerrar();});
  $("btnMarcarTodasLeidas")?.addEventListener('click',async()=>{await fetch(`${API_BASE_URL}/notificaciones/centro-leidas`,{method:'PATCH'}).catch(()=>{}); notificaciones.forEach(n=>n.leida=true); render();});
  $("notificationCenterList")?.addEventListener('click',async e=>{const b=e.target.closest('.notification-item'); if(!b)return; await marcar(b.dataset.id); const url=decodeURIComponent(b.dataset.url||'./'); cerrar(); if(url.startsWith('./?')) location.href=url; else if(url&&url!=='./') location.href=url;});
  cargar();
});
window.addEventListener('autoservicio:sesion',cargar);
