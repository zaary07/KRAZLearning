import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 10000);
const HOSTS = [
  'https://yt.chocolatemoo53.com',
  'https://invidious.nerdvpn.de',
  'https://invidious.tiekoetter.com',
  'https://inv.nadeko.net'
];
// Private mode is enabled once the owner sets JABOUTUBE_ALLOWED_EMAILS
// (comma-separated verified Google addresses) in the Render environment.
const GOOGLE_CLIENT_ID=String(process.env.GOOGLE_CLIENT_ID||'').trim();
const FAMILY_EMAILS=new Set(String(process.env.JABOUTUBE_ALLOWED_EMAILS||'')
  .split(',').map(x=>x.trim().toLowerCase()).filter(x=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)));
const INVITE_SECRET=String(process.env.JABOUTUBE_INVITE_SECRET||'');
const ADMIN_KEY=String(process.env.JABOUTUBE_ADMIN_KEY||'');
const INVITE_ONLY=!!INVITE_SECRET;
const INVITE_READY=INVITE_ONLY&&INVITE_SECRET.length>=32&&ADMIN_KEY.length>=24;
const FAMILY_ONLY=FAMILY_EMAILS.size>0;
const FAMILY_READY=FAMILY_ONLY&&/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID);

const encodePart=object=>Buffer.from(JSON.stringify(object)).toString('base64url');
function signFamily(payload){
 const body=encodePart(payload),signature=createHmac('sha256',INVITE_SECRET).update(body).digest('base64url');
 return body+'.'+signature;
}
function verifyFamily(token,scope){
 if(!INVITE_READY||typeof token!=='string'||token.length>2500||!token.includes('.'))return null;
 const [body,signature,...excess]=token.split('.');
 if(excess.length||!body||!signature)return null;
 const expected=createHmac('sha256',INVITE_SECRET).update(body).digest();
 let provided;
 try{provided=Buffer.from(signature,'base64url')}catch{return null}
 if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return null;
 try{
  const data=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
  if(data.type!==scope||typeof data.uid!=='string'||!/^[-0-9a-f]{36}$/.test(data.uid))return null;
  if(!Number.isFinite(data.exp)||data.exp<=Math.floor(Date.now()/1000))return null;
  if(!['string'].includes(typeof data.name)||data.name.length>80)return null;
  return data;
 }catch{return null}
}
function safeAdminKey(value){
 const a=Buffer.from(String(value||'')),b=Buffer.from(ADMIN_KEY);
 return INVITE_READY&&a.length===b.length&&timingSafeEqual(a,b);
}
function readBody(req,maxBytes=4096){
 return new Promise((resolve,reject)=>{
  let buf='',size=0,closed=false;
  req.on('data',chunk=>{
   if(closed)return;
   size+=chunk.length;
   if(size>maxBytes){closed=true;reject(Error('Requête trop volumineuse'));req.destroy();return;}
   buf+=chunk.toString('utf8');
  });
  req.on('end',()=>{
   if(closed)return;
   try{resolve(JSON.parse(buf||'{}'))}catch{reject(Error('Données JSON invalides'))}
  });
  req.on('error',reject);
 });
}
function inviteIdentity(req){
 const bearer=String(req.headers.authorization||'');
 if(!bearer.startsWith('Bearer '))return null;
 const data=verifyFamily(bearer.slice(7).trim(),'session');
 if(!data)return null;
 return {sub:data.uid,name:data.name,role:'member'};
}

const authCache=new Map();
async function privateIdentity(req){
  if(!FAMILY_READY)return null;
  const header=String(req.headers.authorization||'');
  if(!header.startsWith('Bearer '))return null;
  const token=header.slice(7).trim();
  if(token.length<25||token.length>4096)return null;
  const key=createHash('sha256').update(token).digest('hex');
  const cached=authCache.get(key);
  if(cached&&cached.expires>Date.now())return cached.identity;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);
  try{
    const response=await fetch('https://oauth2.googleapis.com/tokeninfo?access_token='+encodeURIComponent(token),{signal:controller.signal,headers:{accept:'application/json'}});
    if(!response.ok)return null;
    const checked=await response.json();
    if(String(checked.aud||checked.audience||checked.issued_to||'')!==GOOGLE_CLIENT_ID)return null;
    const userResponse=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{authorization:'Bearer '+token,accept:'application/json'},signal:controller.signal});
    if(!userResponse.ok)return null;
    const user=await userResponse.json();
    const email=String(user.email||checked.email||'').trim().toLowerCase();
    const verified=['1','true'].includes(String(user.email_verified??checked.email_verified??checked.verified_email).toLowerCase());
    if(!user.sub||!FAMILY_EMAILS.has(email)||!verified)return null;
    const identity={sub:String(user.sub),email,name:String(user.name||''),picture:String(user.picture||'')};
    authCache.set(key,{identity,expires:Date.now()+Math.min(60000,Math.max(1000,Number(checked.expires_in||60)*1000))});
    if(authCache.size>100){for(const [k,t] of authCache)if(t.expires<Date.now())authCache.delete(k);}
    return identity;
  }catch{return null}finally{clearTimeout(timeout)}
}
const cache = new Map();
const inFlight = new Map();
const hostCooldown = new Map();
const json = (res,status,payload)=>{const b=JSON.stringify(payload);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','access-control-allow-origin':'*','access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'Authorization, Content-Type','vary':'Origin, Authorization'});res.end(b);};
const safeId = v => /^[a-zA-Z0-9_-]{11}$/.test(v);
const norm = v => {
 const id=String(v.videoId||'');
 if(!safeId(id)||v.type&&v.type!=='video')return null;
 const thumbs=v.videoThumbnails||[];
 const preferred=thumbs.find(x=>x.quality==='high')||thumbs.find(x=>x.quality==='medium')||thumbs[0]||{};
 return {url:'/watch?v='+id,videoId:id,title:v.title||'Sans titre',uploader:v.author||'',author:v.author||'',thumbnail:preferred.url||'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',duration:Number(v.lengthSeconds||0),views:Number(v.viewCount||0)};
};
async function upstream(endpoint,allow){
 // Failed public instances should not delay every request for many seconds.
 const hosts=HOSTS.filter(host=>(hostCooldown.get(host)||0)<Date.now());
 if(!hosts.length)throw Error('Fournisseurs vidéo externes momentanément bloqués (HTTP 403).');
 try{
  return await Promise.any(hosts.map(async host=>{
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),5500);
   try{
    const resp=await fetch(host+endpoint,{headers:{accept:'application/json','user-agent':'JabouTube/2.0 personal browser'},signal:controller.signal});
    if(resp.status===403||resp.status===429)hostCooldown.set(host,Date.now()+90000);
    if(!resp.ok)throw Error(host+' HTTP '+resp.status);
    const body=await resp.text();
    if(body.length>5_000_000)throw Error('upstream response too large');
    const v=JSON.parse(body);
    if(!allow(v))throw Error(host+' empty or invalid response');
    return {value:v,host};
   }finally{clearTimeout(timeout);}
  }));
 }catch{
  throw Error('Aucun fournisseur vidéo externe ne répond. Les vidéos publiques restent lisibles via le lecteur YouTube officiel lorsqu’elles autorisent l’intégration.');
 }
}
async function getCached(key,ttl,fn){
 const saved=cache.get(key);
 if(saved&&Date.now()<saved.expires)return saved.value;
 if(inFlight.has(key))return inFlight.get(key);
 const job=Promise.resolve().then(fn).then(value=>{
  cache.set(key,{value,expires:Date.now()+ttl});
  if(cache.size>70){for(const [k,v] of cache){if(Date.now()>v.expires)cache.delete(k);}}
  return value;
 }).finally(()=>inFlight.delete(key));
 inFlight.set(key,job);
 return job;
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
  if(req.method==='OPTIONS'){
    res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'Authorization, Content-Type, X-Admin-Key','access-control-max-age':'600'});
    return res.end();
  }
  if(u.pathname==='/api/family/invite'&&req.method==='POST'){
    if(!INVITE_READY)return json(res,503,{error:'Invitations non configurées par le propriétaire.'});
    if(!safeAdminKey(req.headers['x-admin-key']))return json(res,403,{error:'Clé administrateur incorrecte.'});
    const data=await readBody(req),name=String(data.name||'').trim().slice(0,60);
    if(name.length<2||name.length>60)return json(res,400,{error:'Indique un prénom ou surnom de 2 à 60 caractères.'});
    const now=Math.floor(Date.now()/1000);
    const token=signFamily({type:'invite',uid:randomUUID(),name,exp:now+14*86400});
    const publicOrigin=String(process.env.JABOUTUBE_PUBLIC_URL||'https://jaboutude-server.onrender.com').replace(/\/$/,'');
    return json(res,200,{name,inviteUrl:publicOrigin+'/#invite='+token,expiresAt:new Date((now+14*86400)*1000).toISOString(),reusable:true});
  }
  if(u.pathname==='/api/family/claim'&&req.method==='POST'){
    if(!INVITE_READY)return json(res,503,{error:'Accès familial non configuré.'});
    const data=await readBody(req),invite=verifyFamily(data.invite,'invite');
    if(!invite)return json(res,401,{error:'Invitation invalide ou expirée. Demande un nouveau lien.'});
    const now=Math.floor(Date.now()/1000);
    const session=signFamily({type:'session',uid:invite.uid,name:invite.name,exp:now+365*86400});
    return json(res,200,{session,profile:{sub:invite.uid,name:invite.name,role:'member'},expiresAt:new Date((now+365*86400)*1000).toISOString()});
  }
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
    return json(res,200,{googleConfigured:/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID),googleClientId:GOOGLE_CLIENT_ID,familyOnly:INVITE_ONLY||FAMILY_ONLY,familyReady:INVITE_ONLY?INVITE_READY:FAMILY_READY,inviteOnly:INVITE_ONLY});
  }
  if(u.pathname==='/api/health')return json(res,200,{ok:true,source:'Invidious public instances',historySync:false,server:'JabouTube',familyOnly:INVITE_ONLY||FAMILY_ONLY,inviteOnly:INVITE_ONLY});
  if(u.pathname==='/api/me'||u.pathname==='/api/trending'||u.pathname==='/api/search'||u.pathname.startsWith('/api/streams/')){
    if(INVITE_ONLY){
      if(!INVITE_READY)return json(res,503,{error:'Accès familial non configuré.'});
      const identity=inviteIdentity(req);
      if(!identity)return json(res,401,{error:'Invitation familiale nécessaire ou session expirée.'});
      if(u.pathname==='/api/me')return json(res,200,{user:identity});
    }else if(FAMILY_ONLY){
      if(!FAMILY_READY)return json(res,503,{error:'Accès familial non configuré : GOOGLE_CLIENT_ID manquant ou invalide.'});
      const identity=await privateIdentity(req);
      if(!identity)return json(res,401,{error:'Compte non autorisé. Connecte-toi avec une adresse Google invitée par la famille.'});
      if(u.pathname==='/api/me')return json(res,200,{user:identity});
    }else if(u.pathname==='/api/me'){
      return json(res,409,{error:'Mode familial non activé. Configure JABOUTUBE_ALLOWED_EMAILS.'});
    }
  }
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
    const page=Math.max(1,Math.min(30,Number.parseInt(u.searchParams.get('page')||'1',10)||1));
    const key='search:'+q.toLowerCase()+':page:'+page;
    const items=await getCached(key,120000,async()=>{
      const p='/api/v1/search?q='+encodeURIComponent(q)+'&type=video&sort_by=relevance&page='+page;
      const r=await upstream(p,x=>Array.isArray(x)&&x.length>0);
      return r.value.map(norm).filter(Boolean);
    });
    return json(res,200,{items,page});
  }
  if(u.pathname.startsWith('/api/streams/')){
   const id=u.pathname.slice('/api/streams/'.length);
   if(!safeId(id))return json(res,400,{error:'Identifiant de vidéo invalide.'});
   const item=await getCached('video:'+id,180000,async()=>{
     const r=await upstream('/api/v1/videos/'+id+'?local=true',x=>x&&typeof x==='object'&&x.videoId===id);
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
   return json(res,503,{error:String(e?.message||'Fournisseurs externes indisponibles. Essaie une vidéo publique sur YouTube.'),message:String(e?.message||'Serveur externe indisponible')});
 }
}).listen(PORT,'0.0.0.0',()=>console.log('JabouTube running on port '+PORT));
