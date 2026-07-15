const CACHE_VERSION = 'autoservicio-v6.0.3-hotfix-inicio';
const APP_SHELL = [
  './','./index.html','./style.css?v=603-hotfix-inicio','./app.js?v=603-hotfix-inicio','./config.js?v=603-hotfix-inicio','./excel.js?v=603-hotfix-inicio','./scanner.js?v=603-hotfix-inicio','./reposicion.js?v=603-hotfix-inicio','./ui.js?v=603-hotfix-inicio','./pwa.js?v=603-hotfix-inicio','./dialog.js?v=603-hotfix-inicio','./search.js?v=603-hotfix-inicio','./admin.js?v=603-hotfix-inicio','./auth.js?v=603-hotfix-inicio','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.allSettled(APP_SHELL.map(url => cache.add(url)));
  })());
});
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  const request=event.request; if(request.method!=='GET') return; const url=new URL(request.url);
  if(request.mode==='navigate') { event.respondWith(fetch(request,{cache:'no-store'}).then(r=>{const c=r.clone();caches.open(CACHE_VERSION).then(x=>x.put('./index.html',c));return r;}).catch(()=>caches.match('./index.html'))); return; }
  if(url.origin===self.location.origin) { event.respondWith(fetch(request).then(r=>{if(r?.ok){const c=r.clone();caches.open(CACHE_VERSION).then(x=>x.put(request,c));}return r;}).catch(()=>caches.match(request))); return; }
  event.respondWith(fetch(request).catch(()=>caches.match(request)));
});
