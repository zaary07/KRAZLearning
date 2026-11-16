const CACHE="jaboutube-shell-v18";
const ASSETS=["./","./index.html","./app.js","./auth.js","./recommendations.js","./import.js","./portability.js","./vendor/jszip.min.js","./admin.html","./privacy.html","./terms.html","./manifest.webmanifest","./icon.svg","./jaboutube-icon-192.webp","./jaboutube-icon-512.webp","./jaboutube-apple-touch-icon.png","./jaboutube-logo.webp"];
self.addEventListener("install",event=>event.waitUntil(
 caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
));
self.addEventListener("activate",event=>event.waitUntil(
 caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("jaboutube-shell-")&&key!==CACHE).map(key=>caches.delete(key))))
 .then(()=>self.clients.claim())
));
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 // Never cache authenticated APIs, video metadata or any private responses.
 if(url.pathname.startsWith("/api/"))return;
 event.respondWith(
  fetch(request).then(response=>{
   if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
   return response;
  }).catch(()=>caches.match(request))
 );
});
