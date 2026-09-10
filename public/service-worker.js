const CACHE_NAME='minetrack-react-v1';
self.addEventListener('install',e=>{self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());});
self.addEventListener('fetch',e=>{if(e.request.method==='GET') e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));});
