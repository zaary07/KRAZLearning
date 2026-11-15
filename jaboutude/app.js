"use strict";
const $=id=>document.getElementById(id);
const INSTANCES=[
  {name:"Piped officiel",url:"https://pipedapi.kavin.rocks"},
  {name:"Piped leptons.xyz",url:"https://pipedapi.leptons.xyz"},
  {name:"Piped nosebs.ru",url:"https://pipedapi.nosebs.ru"}
];
const KEYS={history:"jaboutude.history.v1",favs:"jaboutude.favs.v1",instance:"jaboutude.instance.v1"};
const stored=(k,def)=>{try{return JSON.parse(localStorage.getItem(k))??def}catch{return def}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const state={tab:"home",query:"",playing:null,items:[],history:stored(KEYS.history,[]),favorites:stored(KEYS.favs,[]),api:stored(KEYS.instance,INSTANCES[0].url),busy:false,music:false};
function h(s){const x=document.createElement("span");x.textContent=String(s??"");return x.innerHTML;}
function idOf(it){const raw=it?.url||it?.videoId||it?.id||"";const m=String(raw).match(/[?&]v=([\w-]{11})|(?:youtu\.be\/|\/)\b([\w-]{11})\b/);return m?.[1]||m?.[2]||(/^[-\w]{11}$/.test(String(raw))?raw:"");}
function normal(raw){const id=idOf(raw);return id?{id,title:raw.title||"Sans titre",author:raw.uploader||raw.author||"",thumb:raw.thumbnail||raw.thumbnailUrl||"https://i.ytimg.com/vi/"+id+"/hqdefault.jpg",duration:raw.duration||raw.lengthSeconds||0,views:raw.views||0}:null;}
function time(n){n=Math.max(0,Math.floor(Number(n)||0));return Math.floor(n/3600)?[Math.floor(n/3600),String(Math.floor(n/60)%60).padStart(2,"0"),String(n%60).padStart(2,"0")].join(":"):[Math.floor(n/60),String(n%60).padStart(2,"0")].join(":");}
function status(msg){$("status").textContent=msg;}
function setTitle(eyebrow,title,desc){$("eyebrow").textContent=eyebrow;$("heading").textContent=title;$("description").textContent=desc;}
function setTab(tab){
  state.tab=tab;state.music=tab==="music";
  document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x.dataset.tab===tab));
  if(tab==="home"){setTitle("Bienvenue","Tes vidéos, à ta façon.","Les tendances et tes recherches, sans configuration ni abonnement à cette application.");loadTrending();}
  else if(tab==="music"){setTitle("Mode musique","La musique au premier plan.","Recherche un artiste ou un morceau, puis utilise le lecteur audio intégré.");renderMusic();}
  else if(tab==="favorites"){setTitle("Ta bibliothèque","Favoris enregistrés.","Retrouve tes vidéos préférées, sans connexion Google.");renderList(state.favorites,"Aucun favori pour l'instant.");}
  else if(tab==="history"){setTitle("Ta bibliothèque","Historique de lecture.","Enregistré dans ce navigateur et non dans l'historique de ton compte YouTube.");renderList(state.history,"Tu n'as pas encore regardé de vidéo.");}
  else {setTitle("Personnalisation","Paramètres et données.","Choisis ton serveur, sauvegarde ton historique et installe l'application sur iPhone.");renderSettings();}
}
function cards(items){
  return '<div class="grid">'+items.map(item=>'<button class="tile" type="button" data-id="'+h(item.id)+'"><div class="thumb"><img loading="lazy" referrerpolicy="no-referrer" src="'+h(item.thumb)+'" alt=""><span class="play">▶</span>'+(item.duration?'<span class="duration">'+time(item.duration)+'</span>':"")+'</div><div class="meta"><div class="title">'+h(item.title)+'</div><div class="subtitle">'+h(item.author)+'</div></div></button>').join("")+'</div>';
}
function renderList(items,empty){
  state.items=(items||[]).filter(x=>x?.id);
  $("content").innerHTML=state.items.length?cards(state.items):'<div class="empty">'+h(empty)+'</div>';
}
async function request(path){
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),11500);
  try{
    const response=await fetch(state.api+path,{headers:{accept:"application/json"},signal:ctrl.signal,credentials:"omit"});
    if(!response.ok)throw Error("Serveur HTTP "+response.status);
    return await response.json();
  }finally{clearTimeout(timeout);}
}
function fail(msg){
  $("content").innerHTML='<div class="empty"><b>Impossible de récupérer les vidéos.</b><p>'+h(msg)+'</p><p>Les instances gratuites peuvent être indisponibles. Change de serveur dans les paramètres ou réessaie.</p><button id="retry" class="primary">Réessayer</button></div>';
  $("retry").onclick=()=>state.query?search(state.query):loadTrending();
}
async function loadTrending(){
  if(state.busy)return;state.busy=true;status("Chargement des tendances…");
  $("content").innerHTML='<div class="empty">Chargement des tendances françaises…</div>';
  try{
    const data=await request("/trending?region=FR");
    const items=(Array.isArray(data)?data:[]).map(normal).filter(Boolean);
    $("content").innerHTML='<div class="headrow"><h2>Tendances du moment</h2><span class="tag">France</span></div>';
    if(!items.length)throw Error("Cette instance ne renvoie aucune tendance.");
    renderList(items);status(items.length+" vidéos trouvées");
  }catch(e){fail(e.message);status("Service tiers temporairement indisponible");}
  finally{state.busy=false;}
}
async function search(term){
  state.query=term.trim();if(!state.query)return;
  state.tab=state.music?"music":"home";
  const url=getVideoIdFromURL(term);
  if(url){openVideo({id:url,title:"Vidéo YouTube",author:"Lien importé"});return;}
  setTitle("Résultats de recherche","Résultats pour « "+state.query+" »","Sélectionne une vidéo pour la regarder ou l'écouter.");
  $("content").innerHTML='<div class="empty">Recherche en cours…</div>';
  status("Recherche…");
  try{
    const json=await request("/search?q="+encodeURIComponent(state.query)+"&filter=videos");
    const entries=Array.isArray(json)?json:(json.items||[]);
    const items=entries.map(normal).filter(Boolean);
    renderList(items);status(items.length+" résultats");
    if(!items.length)fail("Aucun résultat disponible.");
  }catch(e){fail(e.message);status("Erreur de recherche");}
}
function getVideoIdFromURL(term){
  try{
    const url=new URL(term);if(!["youtube.com","www.youtube.com","m.youtube.com","music.youtube.com","youtu.be"].includes(url.hostname))return "";
    return url.hostname==="youtu.be"?url.pathname.slice(1,12):url.searchParams.get("v")||"";
  }catch{return "";}
}
function renderMusic(){
  $("content").innerHTML='<div class="headrow"><h2>Musique et podcasts</h2><span class="tag">Lecteur audio</span></div><div class="empty"><div style="font-size:52px;margin-bottom:10px">♫</div><h2>Ton espace musique</h2><p>Recherche un titre, un artiste, un album ou colle un lien YouTube Music dans la barre de recherche.</p><div class="actions" style="justify-content:center;margin-top:18px"><button class="secondary" data-q="Musique française">Musique française</button><button class="secondary" data-q="Live acoustic music">Acoustique</button><button class="secondary" data-q="Lofi hip hop">Lo-fi</button></div></div>';
}
function favIndex(id){return state.favorites.findIndex(x=>x.id===id)}
function toggleFav(it){
  const i=favIndex(it.id);
  if(i>=0)state.favorites.splice(i,1);
  else state.favorites.unshift(it);
  save(KEYS.favs,state.favorites);updateFav();
  if(state.tab==="favorites")renderList(state.favorites,"Aucun favori pour l'instant.");
}
function updateFav(){$("favCurrent").textContent=state.playing&&favIndex(state.playing.id)>=0?"♥ Retirer des favoris":"♡ Ajouter aux favoris";}
function historyAdd(it){
  state.history=[it,...state.history.filter(x=>x.id!==it.id)].slice(0,600);
  save(KEYS.history,state.history);
}
function stopPlayers(){
  for(const player of [$("videoPlayer"),$("audioPlayer")]){
    player.pause();player.removeAttribute("src");player.load();player.style.display="none";
  }
}
function playerMessage(msg){$("playerError").style.display="block";$("playerError").textContent=msg;}
async function openVideo(it){
  const id=it.id;if(!/^[-\w]{11}$/.test(id)){status("ID vidéo incorrect");return;}
  state.playing=it;historyAdd(it);updateFav();
  $("watchTitle").textContent=it.title;$("watchAuthor").textContent=it.author||"";
  $("playerOverlay").classList.add("open");$("playerError").style.display="none";
  stopPlayers();$("watchTitle").textContent="Chargement : "+it.title;
  try{
    const data=await request("/streams/"+encodeURIComponent(id));
    const streams=state.music?(data.audioStreams||[]).filter(x=>x.url):((data.videoStreams||[]).filter(x=>!x.videoOnly&&x.url));
    const chosen=state.music?streams.sort((a,b)=>(b.bitrate||0)-(a.bitrate||0))[0]:streams.sort((a,b)=>(b.height||0)-(a.height||0))[0];
    const src=chosen?.url||(!state.music&&data.hls?data.hls:null);
    if(!src)throw Error("Aucun flux "+(state.music?"audio":"vidéo compatible iPhone")+" disponible depuis ce serveur.");
    const player=state.music?$("audioPlayer"):$("videoPlayer");
    player.style.display="block";player.src=src;player.onerror=()=>playerMessage("Ce flux n'est pas lisible ici. Essaie un autre serveur depuis les paramètres. Les flux des instances tierces sont instables.");
    $("watchTitle").textContent=data.title||it.title;
    $("watchAuthor").textContent=data.uploader||it.author||"";
    const full={...it,title:data.title||it.title,author:data.uploader||it.author||"",thumb:data.thumbnailUrl||it.thumb,duration:data.duration||it.duration};
    state.playing=full;historyAdd(full);updateFav();
    player.play().catch(()=>{playerMessage("Appuie sur ▶ dans le lecteur pour démarrer la lecture. iOS exige parfois une interaction directe.");});
  }catch(e){ $("watchTitle").textContent=it.title;playerMessage("Impossible de lire cette vidéo : "+e.message);}
}
function settingsHtml(){return '<div class="settings">'+
'<h2>Serveur de lecture</h2><p class="muted">Ce service utilise des instances communautaires indépendantes. Elles peuvent être hors ligne, limiter leur API ou refuser les vidéos.</p>'+
'<label for="instance">Instance Piped</label><select id="instance">'+INSTANCES.map(x=>'<option value="'+h(x.url)+'" '+(x.url===state.api?"selected":"")+'>'+h(x.name)+'</option>').join("")+'</select>'+
'<label for="customApi">Ou URL HTTPS personnalisée</label><input type="url" id="customApi" placeholder="https://mon-instance.example">'+
'<div class="actions" style="margin-top:12px"><button class="primary" id="applyServer">Enregistrer le serveur</button><button class="secondary" id="testServer">Tester la connexion</button></div>'+
'<div class="notice"><b>Compte Google :</b> non connecté. Cette PWA ne récupère pas les identifiants Google. L’API YouTube officielle ne donne pas accès à l’historique complet de visionnage. Tes données sont conservées localement dans ce navigateur.</div>'+
'<h2 style="margin-top:25px">Historique et favoris</h2><p class="muted">'+state.history.length+" éléments d'historique · "+state.favorites.length+" favoris.</p>"+
'<div class="actions"><button class="secondary" id="exportData">Exporter mes données</button><button class="secondary" id="importData">Importer JSON</button><input type="file" id="importInput" accept=".json,application/json" hidden><button class="secondary" id="clearHistory">Effacer l’historique</button></div>'+
'<div class="notice"><b>Installer sur iPhone :</b> ouvre ce site dans Safari → bouton Partager → « Sur l’écran d’accueil » → « Ajouter ». La lecture en arrière-plan dépend du navigateur et des restrictions iOS.</div>'+
'<p class="muted" style="font-size:12px">Projet personnel indépendant. Ni YouTube ni ReVanced ne sont affiliés à cette application. Les flux peuvent contenir des annonces intégrées à la vidéo par son auteur. Aucune annonce n’est injectée par JabouTude.</p></div>';}
function renderSettings(){
  $("content").innerHTML=settingsHtml();
  $("applyServer").onclick=()=>{
    const manual=$("customApi").value.trim().replace(/\/$/,""),chosen=manual||$("instance").value;
    if(!/^https:\/\/[^\s/]+$/.test(chosen)){alert("Indique une adresse HTTPS valide sans chemin.");return;}
    state.api=chosen;save(KEYS.instance,chosen);status("Serveur enregistré : "+chosen);
  };
  $("testServer").onclick=async()=>{
    status("Test du serveur…");
    try{const res=await request("/trending?region=FR");status(Array.isArray(res)?"Serveur accessible : "+res.length+" vidéos.":"Réponse inattendue du serveur.");}
    catch(e){status("Serveur indisponible : "+e.message);}
  };
  $("exportData").onclick=()=>{
    const data={version:1,history:state.history,favorites:state.favorites,exportedAt:new Date().toISOString()};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="jaboutude-sauvegarde.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  };
  $("importData").onclick=()=>$("importInput").click();
  $("importInput").onchange=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>12_000_000){status("Fichier trop grand.");return;}
    try{
      const json=JSON.parse(await file.text());
      // Accept own backup or Google Takeout JSON watch-history objects
      const own=Array.isArray(json.history)?json.history:null;
      let incoming=own;
      if(!incoming&&Array.isArray(json))incoming=json.map(x=>{
        const id=getVideoIdFromURL(x.titleUrl||"");
        return id?{id,title:(x.title||"Vidéo").replace(/^Watched /i,""),author:(x.subtitles?.[0]?.name||""),thumb:"https://i.ytimg.com/vi/"+id+"/hqdefault.jpg",duration:0}:null;
      }).filter(Boolean);
      if(!incoming)throw Error("Format non reconnu. Utilise une sauvegarde JabouTude ou le JSON watch-history de Google Takeout.");
      const normalList=incoming.filter(x=>x&&/^[-\w]{11}$/.test(x.id)).slice(0,2000);
      state.history=[...normalList,...state.history].filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i).slice(0,2000);
      save(KEYS.history,state.history);
      if(Array.isArray(json.favorites)){state.favorites=json.favorites.filter(x=>x&&/^[-\w]{11}$/.test(x.id)).slice(0,2000);save(KEYS.favs,state.favorites);}
      renderSettings();status(normalList.length+" vidéos importées.");
    }catch(err){status("Import impossible : "+err.message);}
  };
  $("clearHistory").onclick=()=>{if(confirm("Effacer ton historique enregistré sur cet appareil ?")){state.history=[];save(KEYS.history,[]);renderSettings();}};
}
document.addEventListener("click",e=>{
  const tab=e.target.closest("[data-tab]");if(tab){setTab(tab.dataset.tab);return;}
  const tile=e.target.closest("[data-id]");if(tile){
    const it=state.items.find(x=>x.id===tile.dataset.id);if(it)openVideo(it);return;
  }
  const q=e.target.closest("[data-q]");if(q){$("searchInput").value=q.dataset.q;search(q.dataset.q);}
});
$("searchForm").onsubmit=e=>{e.preventDefault();search($("searchInput").value)};
$("settingsTop").onclick=()=>setTab("settings");
$("closePlayer").onclick=()=>{$("playerOverlay").classList.remove("open");stopPlayers()};
$("favCurrent").onclick=()=>{if(state.playing)toggleFav(state.playing)};
$("shareCurrent").onclick=async()=>{
  if(!state.playing)return;
  const url="https://www.youtube.com/watch?v="+state.playing.id;
  if(navigator.share)try{await navigator.share({title:state.playing.title,url});return}catch{}
  navigator.clipboard?.writeText(url).then(()=>status("Lien copié")).catch(()=>prompt("Lien :",url));
};
$("openOriginal").onclick=()=>{if(state.playing)window.open("https://www.youtube.com/watch?v="+state.playing.id,"_blank","noopener")};
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("playerOverlay").classList.contains("open")){$("closePlayer").click()}});
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
setTab("home");
