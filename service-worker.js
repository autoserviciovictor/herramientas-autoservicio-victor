const CACHE_VERSION = 'autoservicio-v6.0.2-mejoras';
const APP_SHELL = [
  './','./index.html','./style.css?v=602-mejoras','./app.js?v=602-mejoras','./config.js?v=602-mejoras','./excel.js?v=602-mejoras','./scanner.js?v=602-mejoras','./reposicion.js?v=602-mejoras','./ui.js?v=602-mejoras','./pwa.js?v=602-mejoras','./dialog.js?v=602-mejoras','./search.js?v=602-mejoras','./admin.js?v=602-mejoras','./auth.js?v=602-mejoras','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png'
];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL))); });
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  const request=event.request; if(request.method!=='GET') return; const url=new URL(request.url);
  if(request.mode==='navigate') { event.respondWith(fetch(request,{cache:'no-store'}).then(r=>{const c=r.clone();caches.open(CACHE_VERSION).then(x=>x.put('./index.html',c));return r;}).catch(()=>caches.match('./index.html'))); return; }
  if(url.origin===self.location.origin) { event.respondWith(fetch(request).then(r=>{if(r?.ok){const c=r.clone();caches.open(CACHE_VERSION).then(x=>x.put(request,c));}return r;}).catch(()=>caches.match(request))); return; }
  event.respondWith(fetch(request).catch(()=>caches.match(request)));
});
