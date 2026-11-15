import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 10000);
const HOSTS = [
  'https://yt.chocolatemoo53.com',
  'https://invidious.nerdvpn.de',
  'https://invidious.tiekoetter.com',
  'https://inv.nadeko.net'
];
const cache = new Map();
const json = (res,status,payload)=>{const b=JSON.stringify(payload);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(b);};
const safeId = v => /^[a-zA-Z0-9_-]{11}$/.test(v);
const norm = v => {
 const id=String(v.videoId||'');
 if(!safeId(id)||v.type&&v.type!=='video')return null;
 const thumbs=v.videoThumbnails||[];
 const preferred=thumbs.find(x=>x.quality==='high')||thumbs.find(x=>x.quality==='medium')||thumbs[0]||{};
 return {url:'/watch?v='+id,videoId:id,title:v.title||'Sans titre',uploader:v.author||'',author:v.author||'',thumbnail:preferred.url||'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',duration:Number(v.lengthSeconds||0),views:Number(v.viewCount||0)};
};
async function upstream(endpoint,allow){
 const result=await Promise.any(HOSTS.map(async host=>{
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),8500);
   try{
     const resp=await fetch(host+endpoint,{headers:{accept:'application/json','user-agent':'JabouTube/2.0 personal browser'},signal:controller.signal});
     if(!resp.ok)throw Error(host+' HTTP '+resp.status);
     const body=await resp.text();
     if(body.length>5_000_000)throw Error('upstream response too large');
     const v=JSON.parse(body);
     if(!allow(v))throw Error(host+' empty or invalid response');
     return {value:v,host};
   }finally{clearTimeout(timeout);}
 }));
 return result;
}
async function getCached(key,ttl,fn){
 const saved=cache.get(key);
 if(saved&&Date.now()<saved.expires)return saved.value;
 const value=await fn();
 cache.set(key,{value,expires:Date.now()+ttl});
 if(cache.size>70){for(const [k,v] of cache){if(Date.now()>v.expires)cache.delete(k);}}
 return value;
}
function fromUpstream(v,host){
 const title=v.title||'Sans titre', author=v.author||'';
 const thumbs=v.videoThumbnails||[];
 const streams=(v.formatStreams||[]).filter(f=>f&&f.url&&/^https:\/\//.test(f.url))
    .map(f=>({url:f.url,videoOnly:false,height:parseInt(f.qualityLabel,10)||360,bitrate:Number(f.bitrate||0),format:f.type||''}));
 const audio=(v.adaptiveFormats||[]).filter(f=>f&&f.url&&String(f.type||'').startsWith('audio/'))
    .map(f=>({url:f.url,bitrate:Number(f.bitrate||0),format:f.type||''}));
 const hls=/^https:\/\//.test(v.hlsUrl||'')?v.hlsUrl:null;
 return {title,uploader:author,author,thumbnailUrl:thumbs.find(x=>x.quality==='high')?.url||thumbs[0]?.url||'',duration:v.lengthSeconds||0,videoStreams:streams,audioStreams:audio,hls,source:host};
}
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url||'/', 'http://localhost');
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  const BRAND_URLS={"/jaboutube-logo.webp":"https://d2ol7oe51mr4n9.cloudfront.net/user_3JeODywvzeYkVfZneh5sFrXTvjJ/ec37d0e7-b937-4616-8997-186789e01464.webp","/jaboutube-icon-512.webp":"https://d2ol7oe51mr4n9.cloudfront.net/user_3JeODywvzeYkVfZneh5sFrXTvjJ/936377bb-0327-468d-8048-74fe72b54937.webp","/jaboutube-icon-192.webp":"https://d2ol7oe51mr4n9.cloudfront.net/user_3JeODywvzeYkVfZneh5sFrXTvjJ/b35e64f9-d3e0-4b23-90a7-ba0817d9a95b.webp","/jaboutube-apple-touch-icon.png":"https://d2ol7oe51mr4n9.cloudfront.net/user_3JeODywvzeYkVfZneh5sFrXTvjJ/bdd64c46-a8ce-4716-bcbc-e3444caf08fd.png"};
  if(Object.prototype.hasOwnProperty.call(BRAND_URLS,u.pathname)){
    const storedBrand=cache.get("brand:"+u.pathname);
    if(storedBrand?.bytes){res.writeHead(200,storedBrand.headers);res.end(storedBrand.bytes);return;}
    const controller=new AbortController();
    const deadline=setTimeout(()=>controller.abort(),12000);
    try{
      const upstreamResponse=await fetch(BRAND_URLS[u.pathname],{signal:controller.signal});
      if(!upstreamResponse.ok)throw Error("Brand asset error "+upstreamResponse.status);
      const bytes=Buffer.from(await upstreamResponse.arrayBuffer());
      if(bytes.length>1500000)throw Error("Brand image too large");
      const headers={"content-type":u.pathname.endsWith(".png")?"image/png":"image/webp","cache-control":"public, max-age=604800","x-content-type-options":"nosniff"};
      cache.set("brand:"+u.pathname,{bytes,headers,expires:Date.now()+604800000});
      res.writeHead(200,headers);res.end(bytes);return;
    }finally{clearTimeout(deadline);}
  }
  if(u.pathname==='/api/config'){
    const clientId=String(process.env.GOOGLE_CLIENT_ID||'').trim();
    return json(res,200,{googleConfigured:/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId),googleClientId:clientId});
  }
  if(u.pathname==='/api/health')return json(res,200,{ok:true,source:'Invidious public instances',historySync:false,server:'JabouTube'});
  if(u.pathname==='/api/trending'){
   const data=await getCached('trending',300000,async()=>{
     const r=await upstream('/api/v1/trending?region=FR',x=>Array.isArray(x)&&x.length>0);
     return r.value.map(norm).filter(Boolean);
   });
   return json(res,200,data);
  }
  if(u.pathname==='/api/search'){
    const q=(u.searchParams.get('q')||'').trim().slice(0,140);
    if(q.length<2)return json(res,400,{error:'Entre au moins deux caractères.'});
    const key='search:'+q.toLowerCase();
    const items=await getCached(key,120000,async()=>{
      const p='/api/v1/search?q='+encodeURIComponent(q)+'&type=video&sort_by=relevance';
      const r=await upstream(p,x=>Array.isArray(x)&&x.length>0);
      return r.value.map(norm).filter(Boolean);
    });
    return json(res,200,{items});
  }
  if(u.pathname.startsWith('/api/streams/')){
   const id=u.pathname.slice('/api/streams/'.length);
   if(!safeId(id))return json(res,400,{error:'Identifiant de vidéo invalide.'});
   const item=await getCached('video:'+id,60000,async()=>{
     const r=await upstream('/api/v1/videos/'+id,x=>x&&typeof x==='object'&&x.videoId===id);
     return fromUpstream(r.value,r.host);
   });
   return json(res,200,item);
  }
  const name=u.pathname==='/'?'/index.html':u.pathname;
  const file=path.resolve(ROOT,'.'+name);
  if(!file.startsWith(ROOT+path.sep))return json(res,403,{error:'Forbidden'});
  fs.readFile(file,(err,data)=>{
   if(err){res.writeHead(404,{'content-type':'text/plain'});res.end('Page non trouvée');return;}
   const headers={'content-type':MIME[path.extname(file)]||'application/octet-stream','x-content-type-options':'nosniff','cache-control':name==='/sw.js'?'no-cache':'public, max-age=120'};
   res.writeHead(200,headers);res.end(data);
  });
 }catch(e){console.error('Request failed',req.url,e);
   return json(res,503,{error:'Les serveurs vidéo publics sont momentanément indisponibles. Réessaie ou utilise le lecteur YouTube officiel.',message:String(e?.errors?.[0]?.message||e?.message||e)});
 }
}).listen(PORT,'0.0.0.0',()=>console.log('JabouTube running on port '+PORT));
