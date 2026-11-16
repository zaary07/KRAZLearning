"use strict";
const $=id=>document.getElementById(id);
const INSTANCES=[
  {name:"Piped officiel",url:"https://pipedapi.kavin.rocks"},
  {name:"Piped leptons.xyz",url:"https://pipedapi.leptons.xyz"},
  {name:"Piped nosebs.ru",url:"https://pipedapi.nosebs.ru"}
];
const KEYS={history:"jaboutube.history.v1",favs:"jaboutube.favs.v1",instance:"jaboutube.instance.v1"};
const stored=(k,def)=>{try{const current=localStorage.getItem(k);const legacy=k.replace(/^jaboutube\./,"jaboutude.");return JSON.parse(current??localStorage.getItem(legacy))??def}catch{return def}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
let latestRequest=0;
const state={tab:"home",query:"",playing:null,items:[],history:stored(KEYS.history,[]),favorites:stored(KEYS.favs,[]),api:stored(KEYS.instance,INSTANCES[0].url),busy:false,music:false};
function h(s){const x=document.createElement("span");x.textContent=String(s??"");return x.innerHTML;}
function idOf(it){const raw=it?.url||it?.videoId||it?.id||"";const m=String(raw).match(/[?&]v=([\w-]{11})|(?:youtu\.be\/|\/)\b([\w-]{11})\b/);return m?.[1]||m?.[2]||(/^[-\w]{11}$/.test(String(raw))?raw:"");}
function normal(raw){const id=idOf(raw);return id?{id,title:raw.title||"Sans titre",author:raw.uploader||raw.author||"",thumb:raw.thumbnail||raw.thumbnailUrl||"https://i.ytimg.com/vi/"+id+"/hqdefault.jpg",duration:raw.duration||raw.lengthSeconds||0,views:raw.views||0}:null;}
function time(n){n=Math.max(0,Math.floor(Number(n)||0));return Math.floor(n/3600)?[Math.floor(n/3600),String(Math.floor(n/60)%60).padStart(2,"0"),String(n%60).padStart(2,"0")].join(":"):[Math.floor(n/60),String(n%60).padStart(2,"0")].join(":");}
function status(msg){$("status").textContent=msg;}
function setTitle(eyebrow,title,desc){$("eyebrow").textContent=eyebrow;$("heading").textContent=title;$("description").textContent=desc;}
function setTab(tab){
  state.tab=tab;state.music=tab==="music";
  const hero=document.querySelector(".hero");if(hero)hero.classList.toggle("compact",tab!=="home");
  const quick=$("quickLinks");if(quick)quick.hidden=tab!=="home";
  document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x.dataset.tab===tab));
  if(tab==="home"){setTitle("À LA UNE","Découvre tes prochaines vidéos.","Un seul endroit pour rechercher, regarder et retrouver tes contenus.");loadTrending();}
  else if(tab==="music"){setTitle("JABOUTUDE MUSIC","Toute ta musique.","Recherche un artiste, un titre ou colle un lien YouTube Music.");renderMusic();}
  else if(tab==="library"){setTitle("BIBLIOTHÈQUE","Ta bibliothèque.","Tes favoris locaux et les playlists YouTube de ton compte Google.");renderLibrary();}
  else if(tab==="favorites"){setTitle("TA BIBLIOTHÈQUE","Tes favoris.","Tes vidéos enregistrées sur cet appareil.");renderList(state.favorites,"Aucun favori pour l'instant.");}
  else if(tab==="history"){setTitle("HISTORIQUE LOCAL","Vidéos regardées ici.","Ton historique JabouTube, enregistré uniquement sur cet appareil.");renderList(state.history,"Aucune vidéo regardée dans JabouTube.");}
  else if(tab==="account"){setTitle("MON COMPTE","Compte et YouTube.","Connexion Google, playlists, abonnements et gestion du compte.");renderAccount();}
  else {setTitle("RÉGLAGES","Paramètres.","Import, export et diagnostic de l’application.");renderSettings();}
}
function cards(items){
  return '<div class="grid">'+items.map(item=>'<button class="tile" type="button" data-id="'+h(item.id)+'"><div class="thumb"><img loading="lazy" referrerpolicy="no-referrer" src="'+h(item.thumb)+'" alt=""><span class="play">▶</span>'+(item.duration?'<span class="duration">'+time(item.duration)+'</span>':"")+'</div><div class="meta"><div class="title">'+h(item.title)+'</div><div class="subtitle">'+h(item.author)+'</div></div></button>').join("")+'</div>';
}
function renderList(items,empty){
  state.items=(items||[]).filter(x=>x?.id);
  $("content").innerHTML=state.items.length?cards(state.items):'<div class="empty">'+h(empty)+'</div>';
}
async function request(path){
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),28000);
  try{
    const response=await fetch('/api'+path,{headers:{accept:"application/json"},signal:ctrl.signal,credentials:"omit",cache:"default"});
    if(!response.ok){const err=await response.json().catch(()=>({}));throw Error(err.error||"Serveur HTTP "+response.status)}
    return await response.json();
  }finally{clearTimeout(timeout);}
}
function fail(msg){
  $("content").innerHTML='<div class="empty"><b>Impossible de récupérer les vidéos.</b><p>'+h(msg)+'</p><p>Les instances gratuites peuvent être indisponibles. Change de serveur dans les paramètres ou réessaie.</p><button id="retry" class="primary">Réessayer</button></div>';
  $("retry").onclick=()=>state.query?search(state.query):loadTrending();
}
async function loadTrending(){
  const seq=++latestRequest;
  status("Chargement des tendances…");
  $("content").innerHTML='<div class="skeleton-grid">'+Array.from({length:8},()=>'<div class="skeleton-card"><div></div><i></i><i></i></div>').join("")+'</div>';
  try{
    const data=await request("/trending");
    if(seq!==latestRequest || state.tab!=="home")return;
    const items=(Array.isArray(data)?data:[]).map(normal).filter(Boolean);
    if(!items.length)throw Error("Aucune tendance disponible pour le moment.");
    renderList(items);status(items.length+" vidéos · tendances en France");
  }catch(e){if(seq!==latestRequest)return;fail(e.message);status("Les tendances ne répondent pas.");}
}
async function search(term){
  state.query=String(term||"").trim();if(!state.query)return;
  const seq=++latestRequest;
  if(getVideoIdFromURL(state.query)){
    const id=getVideoIdFromURL(state.query);
    openVideo({id,title:"Vidéo YouTube",author:"Depuis ton lien",thumb:"https://i.ytimg.com/vi/"+id+"/hqdefault.jpg"});
    return;
  }
  if(state.tab!=="music")state.tab="home";
  document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x.dataset.tab===state.tab));
  setTitle("RECHERCHE","Résultats pour « "+state.query+" »","Choisis une vidéo. La lecture s'ouvre immédiatement.");
  $("content").innerHTML='<div class="skeleton-grid">'+Array.from({length:6},()=>'<div class="skeleton-card"><div></div><i></i><i></i></div>').join("")+'</div>';
  status("Recherche : "+state.query);
  try{
    const data=await request("/search?q="+encodeURIComponent(state.query));
    if(seq!==latestRequest)return;
    const items=(Array.isArray(data)?data:(data.items||[])).map(normal).filter(Boolean);
    if(!items.length)throw Error("Aucun résultat. Essaie des mots-clés différents.");
    renderList(items);status(items.length+" résultats disponibles.");
  }catch(e){if(seq!==latestRequest)return;fail(e.message);status("Recherche indisponible : "+e.message);}
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
  // Called only when changing videos or explicitly stopping audio.
  const embed=$("fallbackEmbed");if(embed){embed.removeAttribute("src");embed.style.display="none";}
  for(const player of [$("videoPlayer"),$("audioPlayer")]){
    player.pause();player.removeAttribute("src");player.load();player.style.display="none";
  }
  $("miniPlayer").hidden=true;
  $("backgroundAudio").disabled=false;
  $("backgroundAudio").textContent="♫ Écouter en arrière-plan / écran verrouillé";
  if("mediaSession" in navigator)navigator.mediaSession.playbackState="none";
}
function playerMessage(msg){$("playerError").style.display="block";$("playerError").textContent=msg;}
function syncMiniPlayer(){
  const audio=$("audioPlayer");
  $("miniPlayer").hidden=!audio.src;
  $("miniTitle").textContent=state.playing?.title||"Lecture audio";
  $("miniSubtitle").textContent=audio.paused?"En pause":"Audio en cours · verrouillage possible";
  $("miniToggle").textContent=audio.paused?"▶":"Ⅱ";
}
function prepareMediaSession(item){
  if(!("mediaSession" in navigator))return;
  try{
    navigator.mediaSession.metadata=new MediaMetadata({
      title:item.title||"JabouTube",artist:item.author||"JabouTube",
      album:"JabouTube",
      artwork:[{src:item.thumb||"https://i.ytimg.com/vi/"+item.id+"/hqdefault.jpg",sizes:"512x512",type:"image/jpeg"}]
    });
    navigator.mediaSession.setActionHandler("play",()=>$("audioPlayer").play().catch(()=>{}));
    navigator.mediaSession.setActionHandler("pause",()=>$("audioPlayer").pause());
    navigator.mediaSession.setActionHandler("stop",()=>stopPlayers());
    navigator.mediaSession.setActionHandler("seekto",details=>{
      const a=$("audioPlayer");if(Number.isFinite(details.seekTime))a.currentTime=details.seekTime;
    });
  }catch(error){console.info("Media Session unavailable",error)}
}
async function openVideo(it){
  const id=it.id;if(!/^[-\w]{11}$/.test(String(id||""))){status("Identifiant vidéo incorrect");return;}
  stopPlayers();
  state.playing=it;historyAdd(it);updateFav();
  $("watchTitle").textContent=it.title||"Vidéo YouTube";
  $("watchAuthor").textContent=it.author||"";
  $("playerError").style.display="none";
  $("playerOverlay").classList.add("open");
  const embed=$("fallbackEmbed");
  if(state.music){
    embed.style.display="none";
    $("backgroundAudio").textContent="♫ Lecture audio (écran verrouillé)";
    // Started by direct user tap: the player is visible; the play button stays accessible.
    startBackgroundAudio().catch(e=>playerMessage(e.message));
  }else{
    embed.style.display="block";
    embed.src="https://www.youtube-nocookie.com/embed/"+encodeURIComponent(id)+"?playsinline=1&rel=0";
  }
  status("Lecteur ouvert.");
}
async function startBackgroundAudio(){
  const item=state.playing;if(!item)return;
  const button=$("backgroundAudio");button.disabled=true;button.textContent="Recherche du flux audio…";
  try{
    const data=await request("/streams/"+encodeURIComponent(item.id));
    if(!state.playing||state.playing.id!==item.id)return;
    const audioChoices=(data.audioStreams||[]).filter(x=>x.url&&/audio\/mp4/i.test(x.format||""))
      .sort((a,b)=>Math.abs((a.bitrate||128000)-128000)-Math.abs((b.bitrate||128000)-128000));
    const chosen=audioChoices[0]||(data.audioStreams||[]).find(x=>x.url);
    if(!chosen)throw Error("Cette vidéo ne possède aucun flux audio accessible.");
    const audio=$("audioPlayer");
    audio.src=chosen.url;audio.style.display="block";
    audio.preload="auto";
    audio.onplay=()=>{syncMiniPlayer();if("mediaSession" in navigator)navigator.mediaSession.playbackState="playing"};
    audio.onpause=()=>{syncMiniPlayer();if("mediaSession" in navigator)navigator.mediaSession.playbackState="paused"};
    audio.onended=()=>{syncMiniPlayer();if("mediaSession" in navigator)navigator.mediaSession.playbackState="none"};
    audio.onerror=()=>{playerMessage("Flux audio bloqué ou incompatible avec iOS. Essaie une autre vidéo.");syncMiniPlayer()};
    $("videoPlayer").pause();
    const embed=$("fallbackEmbed");embed.removeAttribute("src");embed.style.display="none";
    prepareMediaSession(item);
    $("miniPlayer").hidden=false;
    syncMiniPlayer();
    await audio.play().catch(()=>{playerMessage("Pour autoriser l'audio sur iPhone, appuie une fois sur ▶ dans le lecteur audio. La lecture peut ensuite rester active à l'écran verrouillé.")});
  }catch(error){playerMessage("Lecture audio non disponible : "+error.message);}
  finally{button.disabled=false;button.textContent="♫ Écouter en arrière-plan / écran verrouillé";}
}
async function tryDirectPlayer(){
  const it=state.playing;if(!it)return;
  const btn=$("directPlayer");btn.disabled=true;btn.textContent="Chargement du flux direct…";
  try{
    const data=await request("/streams/"+encodeURIComponent(it.id));
    if(!state.playing||state.playing.id!==it.id)return;
    const selected=(data.videoStreams||[]).filter(x=>!x.videoOnly&&x.url).sort((a,b)=>(b.height||0)-(a.height||0))[0];
    const src=selected?.url||data.hls;
    if(!src)throw Error("Aucun flux vidéo direct disponible.");
    const player=$("videoPlayer");player.style.display="block";player.src=src;
    player.onerror=()=>playerMessage("Flux vidéo incompatible avec Safari. Essaie le lecteur YouTube.");
    $("fallbackEmbed").style.display="none";$("fallbackEmbed").removeAttribute("src");
    await player.play().catch(()=>{playerMessage("Appuie sur ▶ dans le lecteur vidéo pour démarrer.");});
  }catch(e){playerMessage(e.message);}
  finally{btn.disabled=false;btn.textContent="Essayer la lecture directe";}
}
function settingsHtml(){return '<div class="settings">'+
'<h2>Compte Google</h2><p class="muted">Connecte-toi depuis l’onglet Compte pour accéder aux playlists et abonnements lorsque l’authentification Google sera configurée.</p><button class="primary" data-tab="account">Ouvrir le compte</button>'+
'<h2 style="margin-top:24px">Historique local</h2><p class="muted">'+state.history.length+' vidéos consultées · '+state.favorites.length+' favoris</p>'+
'<div class="actions"><button class="secondary" id="exportData">Exporter</button><button class="secondary" id="importData">Importer un JSON</button><input type="file" id="importInput" accept=".json,application/json" hidden><button class="secondary" id="clearHistory">Effacer l’historique</button></div>'+
'<div class="notice"><b>Importer ton historique YouTube :</b> exporte « YouTube et YouTube Music » au format JSON dans <a href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer">Google Takeout</a>, puis importe watch-history.json ici. Cela reste une copie locale, pas une synchronisation permanente.</div>'+
'<h2 style="margin-top:24px">Diagnostic</h2><button class="secondary" id="testServer">Tester la connexion vidéo</button>'+
'<div class="notice">Le serveur gratuit peut se mettre en veille, ce qui ralentit la première ouverture. La connexion aux flux vidéo dépend des services disponibles.</div></div>';}

function renderLibrary(){
  const auth=window.JabouAuth?.state;
  const pls=auth?.youtubeConnected?auth.playlists:[];
  const body=pls.length?'<div class="playlist-grid">'+pls.map(x=>'<button class="playlist-item" data-playlist="'+h(x.id)+'"><span>♫</span><strong>'+h(x.snippet?.title||"Playlist")+'</strong><small>'+h(x.contentDetails?.itemCount||0)+' vidéos</small></button>').join("")+'</div>':
      '<div class="notice">'+(auth?.youtubeConnected?"Aucune playlist disponible depuis ton compte.":auth?.profile?"Active l’accès YouTube depuis l’onglet Compte pour afficher tes playlists.":"Connecte ton compte Google depuis l’onglet Compte pour accéder à tes playlists.")+'</div>';
  const fav=state.favorites.filter(x=>x?.id);
  state.items=fav;
  $("content").innerHTML='<div class="headrow"><h2>Mes favoris</h2><span class="tag">'+fav.length+'</span></div>'+
  (fav.length?cards(fav):'<div class="empty">Aucun favori pour l’instant. Ouvre une vidéo et touche ♡.</div>')+
  '<div class="headrow" style="margin-top:28px"><h2>Playlists YouTube</h2><button class="secondary" data-tab="account">Mon compte</button></div>'+body;
}
function renderAccount(){
  const auth=window.JabouAuth?.state;
  if(!auth){$("content").innerHTML='<div class="empty">Initialisation du compte…</div>';return;}
  const p=auth.profile;
  let profile="";
  if(p){
    const pic=/^https:\/\//.test(p.picture||"")?'<img class="profile-photo" src="'+h(p.picture)+'" alt="Photo Google">':'<span class="profile-photo">✓</span>';
    const yt=auth.youtubeConnected?
      '<div class="notice"><b>YouTube connecté</b> · Tes playlists et abonnements sont accessibles avec les autorisations accordées.</div>':
      '<div class="notice">Ton compte Google est connecté. Pour récupérer tes playlists et abonnements, autorise séparément la lecture de ton compte YouTube. Cette autorisation peut nécessiter la validation de JabouTube par Google.</div><button class="primary" data-connect-youtube>Connecter mes playlists YouTube</button>';
    profile='<div class="account-profile">'+pic+'<div><strong>'+h(p.name||p.email||"Compte Google")+'</strong><div class="muted">'+h(p.email||"Compte connecté")+'</div></div></div>'+
      '<div class="actions"><button class="secondary" data-disconnect>Se déconnecter</button><button class="secondary" data-tab="library">Bibliothèque</button></div>'+yt+
      (auth.youtubeConnected?'<div class="headrow"><h2>Mes abonnements</h2><span class="tag">'+auth.subscriptions.length+'</span></div>'+
      (auth.subscriptions.length?'<div class="subscriptions">'+auth.subscriptions.map(x=>'<a href="https://www.youtube.com/channel/'+encodeURIComponent(x.snippet?.resourceId?.channelId||"")+'" target="_blank" rel="noopener noreferrer">'+h(x.snippet?.title||"Chaîne YouTube")+' ↗</a>').join("")+'</div>':'<p class="muted">Aucun abonnement accessible sur ce compte.</p>'):'');
  }else{
    profile='<div class="connect-hero"><div class="google-emblem">G</div><h2>Connexion Google</h2><p class="muted">JabouTube est ouvert à tous les comptes Google. Choisis simplement ton compte pour accéder à ton profil. L’accès aux données YouTube est facultatif.</p>'+
      '<button class="primary" data-login'+(!auth.configured?' disabled':'')+'>'+(auth.loading?"Connexion en cours…":"Continuer avec Google")+'</button>'+
      (!auth.configured?'<p class="setup-note">La connexion publique attend l’activation Google OAuth par le propriétaire de JabouTube.</p>':'')+
      '</div>';
  }
  $("content").innerHTML='<div class="settings account-area">'+profile+
    (auth.error?'<div class="notice">'+h(auth.error)+'</div>':'')+
    '<div class="notice"><b>Historique :</b> Google ne fournit pas automatiquement à JabouTube la liste de toutes les vidéos déjà regardées. L’historique local et l’import Google Takeout restent indépendants.</div>'+
    '<div class="actions"><a class="secondary" href="https://www.youtube.com/feed/history" target="_blank" rel="noopener noreferrer">Historique YouTube ↗</a><a class="secondary" href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer">Google Takeout ↗</a></div>'+
    (!auth.configured?'<div class="owner-setup"><h2>Activation publique — administrateur</h2><p>Crée un client OAuth Google de type Application Web avec l’origine autorisée <code>https://jaboutude-server.onrender.com</code>.</p><p>Configure l’audience <b>Externe</b> et publie l’application <b>En production</b> pour tous les comptes Google. Renseigne le Client ID dans la variable Render <code>GOOGLE_CLIENT_ID</code>.</p><p>L’accès facultatif <code>youtube.readonly</code> nécessite YouTube Data API v3 et peut demander une vérification Google, une politique de confidentialité et un domaine vérifiable.</p><a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener noreferrer">Google Cloud Console ↗</a></div>':'')+
    '<div class="headrow" style="margin-top:25px"><a href="./privacy.html">Confidentialité</a> <a href="./terms.html">Conditions d’utilisation</a></div>'+
  '</div>';
}
function refreshAvatar(){
  const btn=$("accountBtn"),a=window.JabouAuth?.state;if(!btn)return;
  const p=a?.profile;
  if(p&&/^https:\/\//.test(p.picture||"")){
    btn.textContent="";const img=document.createElement("img");img.src=p.picture;img.alt="Compte Google";btn.appendChild(img);
  }else btn.textContent="👤";
  btn.title=p?"Compte Google : "+(p.name||p.email||"Connecté"):"Compte Google";
}
async function showPlaylist(id){
  if(!window.JabouAuth?.state?.profile){setTab("account");return;}
  const seq=++latestRequest;
  $("content").innerHTML='<div class="empty">Chargement de ta playlist Google…</div>';
  try{
    const videos=await window.JabouAuth.playlistItems(id);
    if(seq!==latestRequest)return;
    setTitle("PLAYLIST YOUTUBE","Ta playlist","Vidéo(s) issues de ton compte Google.");
    renderList(videos,"Cette playlist est vide, privée ou inaccessible.");
  }catch(e){$("content").innerHTML='<div class="notice">'+h(e.message)+'</div>';}
}

function renderSettings(){
  $("content").innerHTML=settingsHtml();
  $("testServer").onclick=async()=>{
    status("Vérification du serveur…");
    try{const info=await request("/health");status(info.ok?"Serveur JabouTube disponible.":"Serveur indisponible.");}
    catch(e){status("Connexion impossible : "+e.message);}
  };
  $("exportData").onclick=()=>{
    const data={version:1,history:state.history,favorites:state.favorites,exportedAt:new Date().toISOString()};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="jaboutube-sauvegarde.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
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
      if(!incoming)throw Error("Format non reconnu. Utilise une sauvegarde JabouTube ou le JSON watch-history de Google Takeout.");
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
  const youtube=e.target.closest("[data-connect-youtube]");
  if(youtube){window.JabouAuth?.connectYoutube().catch(err=>status(err.message));return;}
  const login=e.target.closest("[data-login]");
  if(login){window.JabouAuth?.connect().catch(err=>status(err.message));return;}
  if(e.target.closest("[data-disconnect]")){window.JabouAuth?.disconnect();setTab("account");return;}
  const pl=e.target.closest("[data-playlist]");
  if(pl){showPlaylist(pl.dataset.playlist);return;}
  const tab=e.target.closest("[data-tab]");if(tab){setTab(tab.dataset.tab);return;}
  const tile=e.target.closest("[data-id]");if(tile){
    const it=state.items.find(x=>x.id===tile.dataset.id);if(it)openVideo(it);return;
  }
  const q=e.target.closest("[data-q]");if(q){$("searchInput").value=q.dataset.q;search(q.dataset.q);}
});
$("searchForm").onsubmit=e=>{e.preventDefault();search($("searchInput").value)};
$("settingsTop").onclick=()=>setTab("settings");
$("accountBtn").onclick=()=>setTab("account");
$("directPlayer").onclick=()=>tryDirectPlayer();
$("closePlayer").onclick=()=>{
  $("playerOverlay").classList.remove("open");
  if(!$("audioPlayer").src)stopPlayers();
  else syncMiniPlayer();
};
$("backgroundAudio").onclick=()=>startBackgroundAudio();
$("miniToggle").onclick=()=>{const a=$("audioPlayer");if(a.paused)a.play().catch(e=>status(e.message));else a.pause()};
$("miniOpen").onclick=()=>{$("playerOverlay").classList.add("open")};
$("miniStop").onclick=()=>stopPlayers();
$("mobileSearchBtn").onclick=()=>showSearchSheet();
$("closeSearch").onclick=()=>hideSearchSheet();
$("searchShade").addEventListener("click",e=>{if(e.target===$("searchShade"))hideSearchSheet()});
$("mobileSearchForm").onsubmit=e=>{
 e.preventDefault();const query=$("mobileSearchInput").value.trim();
 if(!query)return;hideSearchSheet();$("searchInput").value=query;
 search(query);
};
$("audioPlayer").addEventListener("play",syncMiniPlayer);
$("audioPlayer").addEventListener("pause",syncMiniPlayer);
function showSearchSheet(){
 $("searchShade").hidden=false;
 $("mobileSearchInput").value=$("searchInput").value;
 requestAnimationFrame(()=>$("mobileSearchInput").focus());
}
function hideSearchSheet(){
 $("searchShade").hidden=true;
 $("mobileSearchInput").blur();
}
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
window.JabouAuth?.subscribe(a=>{
  refreshAvatar();
  if(state.tab==="account")renderAccount();
  if(state.tab==="library")renderLibrary();
});
window.JabouAuth?.init();
setTab("home");
