const CACHE="jaboutube-shell-v7";const ASSETS=["./","./index.html","./app.js","./auth.js","./privacy.html","./terms.html","./manifest.webmanifest","./icon.svg","./jaboutube-icon-192.webp","./jaboutube-icon-512.webp","./jaboutube-apple-touch-icon.png","./jaboutube-logo.webp"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{
 const req=e.request;if(req.method!=="GET"||new URL(req.url).origin!==self.location.origin)return;
 e.respondWith(fetch(req).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return r;}).catch(()=>caches.match(req)));
});
