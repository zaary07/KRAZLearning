"use strict";
const $=id=>document.getElementById(id);
const API_BASE=location.hostname==="jaboutude-ios.onrender.com"?"https://jaboutude-server.onrender.com":"";
window.JaboutubeApiBase=API_BASE;
const INSTANCES=[
  {name:"Piped officiel",url:"https://pipedapi.kavin.rocks"},
  {name:"Piped leptons.xyz",url:"https://pipedapi.leptons.xyz"},
  {name:"Piped nosebs.ru",url:"https://pipedapi.nosebs.ru"}
];
const KEYS={history:"jaboutube.history.v1",favs:"jaboutube.favs.v1",instance:"jaboutube.instance.v1"};
let activeMemberKey=null;
function memberStorageKey(key){return activeMemberKey&&activeMemberKey!=="legacy"?key.replace(/^jaboutube\./,"jaboutube.member."+activeMemberKey+"."):key;}
const stored=(k,def)=>{try{const current=localStorage.getItem(memberStorageKey(k));const legacy=activeMemberKey&&activeMemberKey!=="legacy"?null:localStorage.getItem(k.replace(/^jaboutube\./,"jaboutude."));return JSON.parse(current??legacy)??def}catch{return def}};
const save=(k,v)=>localStorage.setItem(memberStorageKey(k),JSON.stringify(v));
let latestRequest=0;
const state={tab:"account",query:"",playing:null,items:[],history:[],favorites:[],api:stored(KEYS.instance,INSTANCES[0].url),busy:false,music:false};
function familyLocked(){const a=window.JabouAuth?.state;return !!(a?.familyOnly&&!a.authorized)}
function switchFamilyProfile(a){
 const next=a.familyOnly?(a.authorized&&a.profile?.sub?String(a.profile.sub):null):"legacy";
 if(next===activeMemberKey)return false;
 if(state.playing){stopPlayers();state.playing=null;}
 activeMemberKey=next;state.items=[];
 state.history=next?stored(KEYS.history,[]):[];
 state.favorites=next?stored(KEYS.favs,[]):[];
 playback.positions=next?stored("jaboutube.positions.v1",{}):{};
 playback.id=null;playback.seconds=0;
 return true;
}
function h(s){const x=document.createElement("span");x.textContent=String(s??"");return x.innerHTML;}
function idOf(it){const raw=it?.url||it?.videoId||it?.id||"";const m=String(raw).match(/[?&]v=([\w-]{11})|(?:youtu\.be\/|\/)\b([\w-]{11})\b/);return m?.[1]||m?.[2]||(/^[-\w]{11}$/.test(String(raw))?raw:"");}
function normal(raw){const id=idOf(raw);return id?{id,title:raw.title||"Sans titre",author:raw.uploader||raw.author||"",thumb:raw.thumbnail||raw.thumbnailUrl||"https://i.ytimg.com/vi/"+id+"/hqdefault.jpg",duration:raw.duration||raw.lengthSeconds||0,views:raw.views||0}:null;}
function time(n){n=Math.max(0,Math.floor(Number(n)||0));return Math.floor(n/3600)?[Math.floor(n/3600),String(Math.floor(n/60)%60).padStart(2,"0"),String(n%60).padStart(2,"0")].join(":"):[Math.floor(n/60),String(n%60).padStart(2,"0")].join(":");}
function status(msg){$("status").textContent=msg;}
function setTitle(eyebrow,title,desc){$("eyebrow").textContent=eyebrow;$("heading").textContent=title;$("description").textContent=desc;}
function setTab(tab){
  if(familyLocked()&&tab!=="account")tab="account";
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
    const headers={accept:"application/json"};
    if(window.JabouAuth?.state?.familyOnly){
      const token=window.JabouAuth.getAccessToken();
      if(!token)throw Error("Connecte-toi avec ton compte familial.");
      headers.Authorization="Bearer "+token;
    }
    const response=await fetch(API_BASE+'/api'+path,{headers,signal:ctrl.signal,credentials:"omit",cache:"default"});
    if(!response.ok){const err=await response.json().catch(()=>({}));throw Error(err.error||"Serveur HTTP "+response.status)}
    return await response.json();
  }finally{clearTimeout(timeout);}
}
function fail(msg){
  $("content").innerHTML='<div class="empty"><b>Impossible de récupérer les vidéos.</b><p>'+h(msg)+'</p><p>Les fournisseurs de recherche externes peuvent être bloqués (HTTP 403). Réessaie, ou colle directement le lien d’une vidéo YouTube publique dans la recherche.</p><button id="retry" class="primary">Réessayer</button></div>';
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
  if(familyLocked()){setTab("account");return;}
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
  if(familyLocked())return;
  const i=favIndex(it.id);
  if(i>=0)state.favorites.splice(i,1);
  else state.favorites.unshift(it);
  save(KEYS.favs,state.favorites);updateFav();
  if(state.tab==="favorites")renderList(state.favorites,"Aucun favori pour l'instant.");
}
function updateFav(){$("favCurrent").textContent=state.playing&&favIndex(state.playing.id)>=0?"♥ Retirer des favoris":"♡ Ajouter aux favoris";}
function historyAdd(it){
  if(familyLocked())return;
  state.history=[it,...state.history.filter(x=>x.id!==it.id)].slice(0,600);
  save(KEYS.history,state.history);
}


/**
 * All players share one video timeline. Audio is always synchronized to video
 * time (seconds) and returning to video seeks back to the audio position.
 * Embedded YouTube uses the official IFrame Player API to read its progress.
 */
const playback={
  id:null,seconds:0,mode:"none",yt:null,ytReady:false,ytInstance:0,
  switching:0,progressTimer:null,lastSaved:0,
  positions:{},audioSrc:""
};
function setPlaybackInfo(message){const el=$("playbackInfo");if(el)el.textContent=message;}
function validSeconds(seconds){return Number.isFinite(Number(seconds))&&Number(seconds)>=0?Number(seconds):0}
function updatePosition(seconds,force=false){
  const n=validSeconds(seconds);if(!playback.id)return;
  if(n<1&&playback.seconds>5&&!force)return;
  playback.seconds=n;
  if(n>2 && (force||Date.now()-playback.lastSaved>4200)){
    playback.positions[playback.id]=Math.round(n);
    playback.lastSaved=Date.now();
    const keys=Object.keys(playback.positions);
    if(keys.length>200){for(const k of keys.slice(0,keys.length-200))delete playback.positions[k]}
    save("jaboutube.positions.v1",playback.positions);
  }
}
function currentPlaybackPosition(){
  const a=$("audioPlayer"),v=$("videoPlayer");
  if(playback.mode==="audio"&&a.src&&Number.isFinite(a.currentTime)&&a.currentTime>0)return a.currentTime;
  if(playback.mode==="native"&&v.src&&Number.isFinite(v.currentTime)&&v.currentTime>0)return v.currentTime;
  if(playback.mode==="embed"&&playback.ytReady&&playback.yt){
    try{const t=playback.yt.getCurrentTime();if(Number.isFinite(t)&&t>=0)return t}catch{}
  }
  return playback.seconds;
}
function updateMediaSessionPosition(){
  if(!("mediaSession" in navigator)||typeof navigator.mediaSession.setPositionState!=="function")return;
  try{
    const a=$("audioPlayer");
    if(playback.mode!=="audio"||!Number.isFinite(a.duration)||a.duration<=0)return;
    navigator.mediaSession.setPositionState({duration:a.duration,position:Math.min(a.duration,validSeconds(a.currentTime)),playbackRate:a.playbackRate||1});
  }catch{}
}
function stopProgressTracker(){
  if(playback.progressTimer){clearInterval(playback.progressTimer);playback.progressTimer=null}
}
function startProgressTracker(){
  stopProgressTracker();
  playback.progressTimer=setInterval(()=>{
    if(playback.mode==="none")return;
    const p=currentPlaybackPosition();
    if(p>=playback.seconds-1)updatePosition(p);
    if(playback.mode==="audio")updateMediaSessionPosition();
  },1000);
}
let iframeAPIPromise=null;
function loadIframeAPI(){
  if(window.YT&&window.YT.Player)return Promise.resolve();
  if(iframeAPIPromise)return iframeAPIPromise;
  iframeAPIPromise=new Promise((resolve,reject)=>{
    const previous=window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady=()=>{try{if(typeof previous==="function")previous()}catch{} resolve()};
    const s=document.createElement("script");
    s.src="https://www.youtube.com/iframe_api";s.async=true;
    s.onerror=()=>reject(Error("API YouTube indisponible"));
    document.head.appendChild(s);
  });
  return iframeAPIPromise;
}
function clearYouTubeIframe(){
  playback.ytInstance++;
  const old=$("fallbackEmbed");
  if(!old)return;
  const fresh=old.cloneNode(false);
  fresh.removeAttribute("src");fresh.style.display="none";
  old.replaceWith(fresh);
  if(playback.yt){try{playback.yt.destroy()}catch{}}
  playback.yt=null;playback.ytReady=false;
}
function pauseYouTube(){
  if(playback.yt&&playback.ytReady){try{playback.yt.pauseVideo()}catch{}}
}
function showYouTubeVideo(startSeconds=0){
  const item=state.playing;if(!item)return;
  clearYouTubeIframe();
  const iframe=$("fallbackEmbed"),seconds=Math.max(0,Math.floor(validSeconds(startSeconds)));
  const token=playback.ytInstance;
  $("playerError").style.display="none";
  $("backgroundAudio").disabled=false;
  iframe.style.display="block";
  const url="https://www.youtube-nocookie.com/embed/"+encodeURIComponent(item.id)+
      "?playsinline=1&rel=0&autoplay=1&enablejsapi=1&origin="+encodeURIComponent(location.origin)+
      (seconds?"&start="+seconds:"");
  iframe.src=url;
  playback.mode="embed";updatePosition(seconds,true);startProgressTracker();
  setPlaybackInfo("Vidéo à "+time(seconds)+". Appuie sur ▶ si le navigateur ne lance pas automatiquement.");
  loadIframeAPI().then(()=>{
    if(playback.ytInstance!==token||playback.mode!=="embed"||state.playing?.id!==item.id)return;
    try{
      playback.yt=new YT.Player(iframe,{
        events:{
          onReady:event=>{
            if(playback.ytInstance!==token)return;
            playback.ytReady=true;
            if(seconds>0)try{event.target.seekTo(seconds,true)}catch{}
            try{event.target.playVideo()}catch{}
          },
          onAutoplayBlocked:()=>{
            if(playback.ytInstance!==token)return;
            setPlaybackInfo("Lecture automatique bloquée par le navigateur. Appuie sur ▶ une fois pour autoriser le son.");
          },
          onStateChange:event=>{
            if(playback.ytInstance!==token)return;
            try{updatePosition(event.target.getCurrentTime())}catch{}
          },
          onError:event=>{
            if(playback.ytInstance!==token||state.playing?.id!==item.id)return;
            const code=Number(event.data);
            const unavailable=code===100;
            const embedBlocked=code===101||code===150;
            if(unavailable||embedBlocked){
              playerMessage(unavailable
                ?"Cette vidéo n’est plus disponible sur YouTube (supprimée, privée ou restreinte). Choisis une autre vidéo publique."
                :"Cette vidéo ne permet pas la lecture intégrée. Essaie son lien YouTube officiel si elle est accessible.");
              $("backgroundAudio").disabled=true;
            }else if(code===153){
              playerMessage("YouTube a refusé le lecteur intégré. Ouvre la vidéo sur YouTube ou essaie une autre vidéo publique.");
            }else{
              playerMessage("Lecture YouTube impossible (code "+code+"). Essaie une autre vidéo publique.");
            }
            setPlaybackInfo("Une erreur YouTube ne dépend pas du système Android ou iOS. Les vidéos retirées pour droits d’auteur restent indisponibles.");
          }
        }
      });
    }catch(error){console.info("YouTube IFrame progress tracking",error)}
  }).catch(()=>setPlaybackInfo("Vidéo ouverte. Le suivi précis de sa position dépend de l’API YouTube."));
}
function stopPlayers(){
  // Capture time first so reopening this video may resume where it stopped.
  updatePosition(currentPlaybackPosition(),true);stopProgressTracker();
  clearYouTubeIframe();
  for(const player of [$("videoPlayer"),$("audioPlayer")]){
    player.pause();player.removeAttribute("src");player.load();player.style.display="none";
  }
  playback.mode="none";playback.audioSrc="";
  $("miniPlayer").hidden=true;
  $("backgroundAudio").disabled=false;
  $("backgroundAudio").textContent="♫ Passer à l'audio · garder la position";
  if("mediaSession" in navigator)navigator.mediaSession.playbackState="none";
}
function playerMessage(msg){$("playerError").style.display="block";$("playerError").textContent=msg;}
function syncMiniPlayer(){
  const audio=$("audioPlayer");
  $("miniPlayer").hidden=!(playback.mode==="audio"&&audio.src);
  $("miniTitle").textContent=state.playing?.title||"Lecture audio";
  $("miniSubtitle").textContent=audio.paused?"En pause · position "+time(audio.currentTime||playback.seconds):"Écoute · "+time(audio.currentTime||playback.seconds);
  $("miniToggle").textContent=audio.paused?"▶":"Ⅱ";
}
function prepareMediaSession(item){
  if(!("mediaSession" in navigator))return;
  try{
    navigator.mediaSession.metadata=new MediaMetadata({
      title:item.title||"JabouTube",artist:item.author||"JabouTube",album:"JabouTube",
      artwork:[{src:item.thumb||"https://i.ytimg.com/vi/"+item.id+"/hqdefault.jpg",sizes:"512x512",type:"image/jpeg"}]
    });
    navigator.mediaSession.setActionHandler("play",()=>$("audioPlayer").play().catch(()=>{}));
    navigator.mediaSession.setActionHandler("pause",()=>$("audioPlayer").pause());
    navigator.mediaSession.setActionHandler("stop",()=>stopPlayers());
    navigator.mediaSession.setActionHandler("seekto",details=>{
      const audio=$("audioPlayer");
      if(Number.isFinite(details.seekTime)){
        audio.currentTime=details.seekTime;updatePosition(details.seekTime,true);updateMediaSessionPosition();
      }
    });
  }catch(error){console.info("Media Session unavailable",error)}
}
function syncPlayerButtons(){
  $("switchVideo").disabled=!state.playing||playback.mode==="embed";
  const btn=$("pipButton");
  btn.textContent=playback.mode==="native"?"▣ Passer en Picture-in-Picture":"▣ Activer le Picture-in-Picture";
}
async function openVideo(item){
  if(familyLocked()){setTab("account");return;}
  if(!/^[-\w]{11}$/.test(String(item?.id||""))){status("Identifiant vidéo incorrect");return;}
  if(state.playing)stopPlayers();
  else {stopProgressTracker();clearYouTubeIframe();}
  state.playing=item;historyAdd(item);updateFav();
  playback.id=item.id;
  playback.seconds=validSeconds(playback.positions[item.id]||0);
  playback.switching++;
  $("watchTitle").textContent=item.title||"Vidéo YouTube";
  $("watchAuthor").textContent=item.author||"";
  $("playerError").style.display="none";
  $("playerOverlay").classList.add("open");
  syncPlayerButtons();
  if(state.music){
    playback.mode="audio";
    $("backgroundAudio").textContent="♫ Lecture audio (écran verrouillé)";
    startBackgroundAudio().catch(e=>playerMessage(e.message));
  }else showYouTubeVideo(playback.seconds);
  status("Lecteur ouvert");
}
async function startBackgroundAudio(){
  const item=state.playing;if(!item)return;
  if(playback.mode==="audio" && $("audioPlayer").src){
    $("audioPlayer").play().catch(()=>playerMessage("Appuie sur ▶ pour lancer l’audio."));
    return;
  }
  const switchId=++playback.switching;
  const button=$("backgroundAudio");button.disabled=true;button.textContent="Synchronisation de l'audio…";
  try{
    const data=await request("/streams/"+encodeURIComponent(item.id));
    if(switchId!==playback.switching||state.playing?.id!==item.id)return;
    // iOS compatibility: prefer AAC-LC (mp4a.40.2) over HE-AAC (mp4a.40.5).
    // URLs are resolved through Invidious local=true to avoid Googlevideo 403.
    const audioChoices=(data.audioStreams||[]).filter(x=>x.url&&/audio\/mp4/i.test(x.format||""))
      .sort((a,b)=>{
        const compat=x=>/mp4a\.40\.2/.test(x.format||"")?0:1;
        return compat(a)-compat(b)||Math.abs((a.bitrate||128000)-128000)-Math.abs((b.bitrate||128000)-128000);
      });
    const chosen=audioChoices[0]||(data.audioStreams||[]).find(x=>x.url);
    if(!chosen)throw Error("Aucun flux audio compatible disponible.");
    // Read the actual time just before switching, not before the network request.
    const from=currentPlaybackPosition();
    updatePosition(from,true);
    const audio=$("audioPlayer");
    audio.pause();audio.src=chosen.url;audio.style.display="block";audio.preload="auto";audio.load();
    // loadedmetadata is needed before seeking on Safari/iPhone.
    const seekAfterMetadata=()=>{
      if(switchId!==playback.switching)return;
      try{
        const max=Number.isFinite(audio.duration)?Math.max(0,audio.duration-0.5):from;
        audio.currentTime=Math.min(from,max);
        updatePosition(audio.currentTime||from,true);
      }catch{playback.seconds=from}
    };
    await new Promise((resolve,reject)=>{
      if(audio.readyState>=1){seekAfterMetadata();resolve();return;}
      const timer=setTimeout(()=>{cleanup();reject(Error("Le flux audio met trop de temps à répondre. Réessaie ou sélectionne une autre vidéo."))},22000);
      function cleanup(){clearTimeout(timer);audio.removeEventListener("loadedmetadata",ready);audio.removeEventListener("error",broken)}
      function ready(){cleanup();seekAfterMetadata();resolve()}
      function broken(){cleanup();reject(Error("Flux audio indisponible sur cet appareil."))}
      audio.addEventListener("loadedmetadata",ready,{once:true});
      audio.addEventListener("error",broken,{once:true});
    });
    if(switchId!==playback.switching||state.playing?.id!==item.id)return;
    // Switch only after the new player has found the same timestamp.
    pauseYouTube();clearYouTubeIframe();
    const video=$("videoPlayer");video.pause();video.style.display="none";
    playback.mode="audio";playback.audioSrc=chosen.url;
    prepareMediaSession(item);startProgressTracker();
    audio.onplay=()=>{syncMiniPlayer();if("mediaSession" in navigator)navigator.mediaSession.playbackState="playing"};
    audio.onpause=()=>{updatePosition(audio.currentTime,true);syncMiniPlayer();if("mediaSession" in navigator)navigator.mediaSession.playbackState="paused"};
    audio.ontimeupdate=()=>{updatePosition(audio.currentTime);updateMediaSessionPosition()};
    audio.onended=()=>{syncMiniPlayer();if("mediaSession" in navigator)navigator.mediaSession.playbackState="none"};
    audio.onerror=()=>{playerMessage("Le flux audio a été interrompu par le serveur.");syncMiniPlayer()};
    syncMiniPlayer();syncPlayerButtons();
    setPlaybackInfo("Audio synchronisé à "+time(from)+". Tu peux verrouiller l’écran si ton navigateur autorise cette lecture.");
    await audio.play().catch(()=>playerMessage("Sur mobile, appuie sur ▶ dans le lecteur audio pour reprendre à "+time(from)+"."));
  }catch(error){playerMessage("Impossible de passer à l’audio : "+error.message+" Le lecteur vidéo reste disponible.")}
  finally{if(switchId===playback.switching){button.disabled=false;button.textContent="♫ Passer à l'audio · garder la position"}}
}
function switchToVideo(){
  const item=state.playing;if(!item)return;
  playback.switching++;
  const from=currentPlaybackPosition();
  updatePosition(from,true);
  $("audioPlayer").pause();$("audioPlayer").removeAttribute("src");$("audioPlayer").load();$("audioPlayer").style.display="none";
  $("videoPlayer").pause();$("videoPlayer").removeAttribute("src");$("videoPlayer").load();$("videoPlayer").style.display="none";
  $("miniPlayer").hidden=true;
  showYouTubeVideo(from);
  syncPlayerButtons();
  setPlaybackInfo("Retour à la vidéo à "+time(from)+". La reprise automatique dépend des règles de lecture d’iOS.");
}
async function tryDirectPlayer({forPip=false}={}){
  const item=state.playing;if(!item)return false;
  const sw=++playback.switching;
  const from=currentPlaybackPosition();
  const btn=$("directPlayer");btn.disabled=true;btn.textContent="Chargement du lecteur natif…";
  try{
    const data=await request("/streams/"+encodeURIComponent(item.id));
    if(sw!==playback.switching||state.playing?.id!==item.id)return false;
    const streams=(data.videoStreams||[]).filter(x=>!x.videoOnly&&x.url).sort((a,b)=>{
      const score=x=>(/video\/mp4/i.test(x.format||"")?2000:0)+(x.height<=720?1000:0)+(x.height||0);
      return score(b)-score(a);
    });
    const src=streams[0]?.url||data.hls;
    if(!src)throw Error("Pas de flux vidéo natif disponible pour cette vidéo.");
    const native=$("videoPlayer");
    native.pause();native.src=src;native.style.display="block";
    native.onplay=()=>{playback.mode="native";syncPlayerButtons()};
    native.ontimeupdate=()=>updatePosition(native.currentTime);
    native.onerror=()=>{playerMessage("Le flux vidéo natif n’est pas compatible avec ce navigateur. Reviens à la vidéo YouTube.");setPlaybackInfo("Flux natif indisponible sur cet iPhone.")};
    native.load();
    await new Promise((resolve,reject)=>{
      if(native.readyState>=1){resolve();return}
      const timer=setTimeout(()=>{cleanup();reject(Error("Le flux vidéo ne charge pas."))},11000);
      function cleanup(){clearTimeout(timer);native.removeEventListener("loadedmetadata",ready);native.removeEventListener("error",broken)}
      function ready(){cleanup();resolve()}
      function broken(){cleanup();reject(Error("Vidéo native non lisible."))}
      native.addEventListener("loadedmetadata",ready,{once:true});native.addEventListener("error",broken,{once:true});
    });
    if(sw!==playback.switching)return false;
    try{native.currentTime=Number.isFinite(native.duration)?Math.min(from,Math.max(0,native.duration-0.4)):from}catch{}
    updatePosition(from,true);
    $("audioPlayer").pause();$("audioPlayer").removeAttribute("src");$("audioPlayer").load();$("audioPlayer").style.display="none";
    pauseYouTube();clearYouTubeIframe();
    playback.mode="native";startProgressTracker();syncPlayerButtons();
    $("miniPlayer").hidden=true;
    setPlaybackInfo("Vidéo native synchronisée à "+time(from)+". Le mode PiP dépend de la prise en charge par iOS.");
    native.play().catch(()=>playerMessage("Appuie sur ▶ dans la vidéo pour lancer la lecture."));
    if(forPip)setPlaybackInfo("Lecteur natif prêt. Appuie à nouveau sur le bouton PiP pour ouvrir la fenêtre flottante.");
    return true;
  }catch(error){
    const video=$("videoPlayer");
    video.pause();video.removeAttribute("src");video.load();video.style.display="none";
    playerMessage(error.message+" Le lecteur YouTube reste disponible si cette vidéo autorise l’intégration.");
    return false;
  }finally{btn.disabled=false;btn.textContent="Essayer la lecture vidéo native"}
}
async function togglePictureInPicture(){
  const video=$("videoPlayer");
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||
    (navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  const installed=window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===true;
  if(ios&&installed){
    setPlaybackInfo("iOS limite le Picture-in-Picture dans les Web Apps installées. Ouvre JabouTube dans Safari puis utilise le PiP d’une vidéo native compatible.");
    return;
  }
  // Native media must first be loaded. PiP activation still requires a real user tap.
  if(playback.mode!=="native"||video.readyState<1){await tryDirectPlayer({forPip:true});return;}
  try{
    if(typeof video.webkitSupportsPresentationMode==="function" &&
       !video.webkitSupportsPresentationMode("picture-in-picture")){
      setPlaybackInfo("PiP non pris en charge pour ce flux dans ce navigateur. Essaie Safari avec une vidéo native compatible.");
      return;
    }
    if(typeof video.webkitSetPresentationMode==="function"){
      video.webkitSetPresentationMode(video.webkitPresentationMode==="picture-in-picture"?"inline":"picture-in-picture");
    }else if(typeof video.requestPictureInPicture==="function"){
      await video.requestPictureInPicture();
    }else{
      setPlaybackInfo("Le Picture-in-Picture n’est pas disponible dans ce navigateur. Essaie Safari.");
    }
  }catch(error){setPlaybackInfo("PiP refusé par le navigateur ("+error.name+"). La vidéo native et Safari peuvent offrir des fonctionnalités différentes.")}
}
function settingsHtml(){return '<div class="settings">'+
'<h2>Compte personnel</h2><p class="muted">'+(window.JabouAuth?.state?.inviteOnly?'Un lien personnel suffit pour rejoindre JabouTube. Ton appareil est ensuite reconnu automatiquement.':'Connecte-toi depuis l’onglet Compte pour accéder à ton espace.')+'</p><button class="primary" data-tab="account">Ouvrir le compte</button>'+
'<h2 style="margin-top:24px">Historique personnel</h2><p class="muted">'+state.history.length+' vidéos consultées · '+state.favorites.length+' favoris</p>'+
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
function renderInviteAccount(auth){
  const p=auth.profile;
  const account=p
    ?'<div class="account-profile"><span class="profile-photo">✓</span><div><strong>'+h(p.name||"Membre de la famille")+'</strong><div class="muted">Espace JabouTube privé sur cet appareil</div></div></div>'+
     '<div class="actions"><button class="secondary" data-disconnect>Quitter cet espace</button><button class="secondary" data-tab="library">Ma bibliothèque</button></div>'
    :'<div class="connect-hero"><div class="google-emblem">♡</div><h2>JabouTube Famille</h2><p class="muted">Ouvre ton invitation personnelle une seule fois. Ensuite, l’appareil te reconnaît automatiquement sans clé administrateur ni mot de passe.</p></div>';
  const google=!p?'':auth.youtubeConnected
    ?'<div class="notice"><b>YouTube connecté</b> · '+h(auth.googleProfile?.email||auth.googleProfile?.name||"Compte Google")+'</div>'+
     '<div class="actions"><button class="secondary" data-disconnect-google>Déconnecter YouTube</button><button class="secondary" data-tab="library">Voir mes playlists</button></div>'+
     '<div class="headrow"><h2>Mes abonnements YouTube</h2><span class="tag">'+auth.subscriptions.length+'</span></div>'+
     (auth.subscriptions.length?'<div class="subscriptions">'+auth.subscriptions.map(x=>'<a href="https://www.youtube.com/channel/'+encodeURIComponent(x.snippet?.resourceId?.channelId||"")+'" target="_blank" rel="noopener noreferrer">'+h(x.snippet?.title||"Chaîne YouTube")+'</a>').join("")+'</div>':'<p class="muted">Aucun abonnement accessible depuis ce compte.</p>')
    :'<div class="headrow" style="margin-top:22px"><h2>Mon compte YouTube</h2></div>'+
     '<p class="muted">Associe ton compte Google pour consulter tes playlists et abonnements personnels. Cette connexion ne remplace pas ton espace familial.</p>'+
     '<button class="primary" data-connect-youtube '+(!auth.configured||auth.loading?'disabled':'')+'>Connecter Google / YouTube</button>'+
     (!auth.configured?'<p class="setup-note">Connexion temporairement indisponible : le propriétaire doit encore activer Google OAuth et YouTube Data API v3. La clé familiale ne résout pas cette configuration.</p>':'');
  $("content").innerHTML='<div class="settings account-area">'+account+google+
    (auth.error?'<div class="notice">'+h(auth.error)+'</div>':'')+
    '<p class="muted">Historique et favoris locaux, distincts pour chaque membre sur ce navigateur. Pas encore synchronisés entre appareils.</p>'+
    '<div class="headrow"><a href="./privacy.html">Confidentialité</a> <a href="./terms.html">Conditions d’utilisation</a></div></div>';
}
function renderAccount(){
  const auth=window.JabouAuth?.state;
  if(!auth){$("content").innerHTML='<div class="empty">Initialisation du compte…</div>';return;}
  if(auth.inviteOnly){renderInviteAccount(auth);return;}
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
    profile='<div class="connect-hero"><div class="google-emblem">G</div><h2>Connexion Google</h2><p class="muted">JabouTube est conçu pour un usage familial. Chacun utilise son propre compte Google ; après activation, seules les adresses invitées peuvent accéder à l’application.</p>'+
      '<button class="primary" data-login'+(!auth.configured?' disabled':'')+'>'+(auth.loading?"Connexion en cours…":"Continuer avec Google")+'</button>'+
      (!auth.configured?'<p class="setup-note">La connexion publique attend l’activation Google OAuth par le propriétaire de JabouTube.</p>':'')+
      '</div>';
  }
  $("content").innerHTML='<div class="settings account-area">'+
    (!auth.familyOnly?'<div class="notice"><b>Accès familial non activé :</b> le propriétaire doit ajouter les adresses autorisées sur Render. Le site n’est pas encore privé.</div>':'')+
    (auth.familyOnly&&auth.authorized?'<div class="notice"><b>Profil personnel :</b> l’historique et les favoris sont séparés par compte sur cet appareil. Les données locales ne sont pas chiffrées et ne sont pas synchronisées entre appareils.</div>':'')+profile+
    (auth.error?'<div class="notice">'+h(auth.error)+'</div>':'')+
    '<div class="notice"><b>Historique :</b> Google ne fournit pas automatiquement à JabouTube la liste de toutes les vidéos déjà regardées. L’historique local et l’import Google Takeout restent indépendants.</div>'+
    '<div class="actions"><a class="secondary" href="https://www.youtube.com/feed/history" target="_blank" rel="noopener noreferrer">Historique YouTube ↗</a><a class="secondary" href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer">Google Takeout ↗</a></div>'+
    (!auth.configured?'<div class="owner-setup"><h2>Activation familiale — administrateur</h2><p>Crée un client OAuth Google de type Application Web avec l’origine autorisée <code>https://jaboutude-server.onrender.com</code>.</p><p>Configure l’audience <b>Externe</b> et ajoute les comptes familiaux aux utilisateurs de test ou à l’audience autorisée. Renseigne <code>GOOGLE_CLIENT_ID</code> puis la liste des adresses familiales séparées par des virgules dans <code>JABOUTUBE_ALLOWED_EMAILS</code> sur Render.</p><p>L’accès facultatif <code>youtube.readonly</code> nécessite YouTube Data API v3 et peut demander une vérification Google, une politique de confidentialité et un domaine vérifiable.</p><a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener noreferrer">Google Cloud Console ↗</a></div>':'')+
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
  if(e.target.closest("[data-disconnect-google]")){window.JabouAuth?.disconnectGoogle();setTab("account");return;}
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
$("switchVideo").onclick=()=>switchToVideo();
$("pipButton").onclick=()=>togglePictureInPicture();
$("closePlayer").onclick=()=>{
  $("playerOverlay").classList.remove("open");
  if(!$("audioPlayer").src)stopPlayers();
  else syncMiniPlayer();
};
$("backgroundAudio").onclick=()=>startBackgroundAudio();
$("videoPlayer").addEventListener("timeupdate",()=>{if(playback.mode==="native")updatePosition($("videoPlayer").currentTime)});
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
window.addEventListener("pagehide",()=>updatePosition(currentPlaybackPosition(),true));
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
  const changed=switchFamilyProfile(a);
  refreshAvatar();
  if(a.familyOnly&&(!a.authorized||changed)){setTab(a.authorized?"home":"account");return;}
  if(state.tab==="account")renderAccount();
  if(state.tab==="library")renderLibrary();
});
setTab("account");
window.JabouAuth?.init().then(()=>{
  if(!window.JabouAuth?.state.familyOnly)setTab("home");
  else if(!window.JabouAuth?.state.authorized)setTab("account");
}).catch(()=>setTab("account"));
