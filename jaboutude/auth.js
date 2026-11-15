"use strict";
(function(){
  const state={clientId:"",configured:false,token:null,profile:null,playlists:[],subscriptions:[],expiresAt:0,loading:false,error:""};
  const listeners=new Set();
  let tokenClient=null,scriptPromise=null;
  const notify=()=>listeners.forEach(fn=>{try{fn({...state})}catch(e){console.warn("Auth UI",e)}});
  const subscribe=fn=>{listeners.add(fn);fn({...state});return()=>listeners.delete(fn)};
  const fail=(error)=>{state.loading=false;state.error=String(error?.message||error||"Erreur de connexion Google");notify()};
  async function init(){
    try{
      const resp=await fetch("/api/config",{credentials:"same-origin",cache:"no-store"});
      if(!resp.ok)throw Error("Configuration inaccessible");
      const d=await resp.json();
      state.clientId=String(d.googleClientId||"");
      state.configured=!!d.googleConfigured;
      notify();
    }catch(error){fail(error)}
  }
  function loadGoogle(){
    if(window.google?.accounts?.oauth2)return Promise.resolve();
    if(scriptPromise)return scriptPromise;
    scriptPromise=new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://accounts.google.com/gsi/client";
      script.async=true;script.onload=resolve;script.onerror=()=>reject(Error("Impossible de charger Google Identity Services"));
      document.head.appendChild(script);
    });
    return scriptPromise;
  }
  function requireToken(){
    if(!state.token || Date.now()>state.expiresAt-12000)throw Error("Session Google expirée. Reconnecte-toi.");
    return state.token;
  }
  async function googleGet(endpoint){
    const response=await fetch("https://www.googleapis.com/"+endpoint,{
      headers:{Authorization:"Bearer "+requireToken(),Accept:"application/json"},
      cache:"no-store"
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(body.error?.message||"Google HTTP "+response.status);
    return body;
  }
  async function fetchCollections(){
    const requests=await Promise.allSettled([
      googleGet("youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50"),
      googleGet("youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50")
    ]);
    state.playlists=requests[0].status==="fulfilled"?requests[0].value.items||[]:[];
    state.subscriptions=requests[1].status==="fulfilled"?requests[1].value.items||[]:[];
    if(requests.some(x=>x.status==="rejected")){
      state.error="Connexion réussie, mais certaines données YouTube sont indisponibles. Vérifie que YouTube Data API v3 est activée et que les autorisations ont été acceptées.";
    }
    notify();
  }
  async function acceptToken(response){
    if(response.error)throw Error(response.error_description||response.error);
    if(!response.access_token)throw Error("Google n'a pas fourni de jeton d'accès.");
    state.token=response.access_token;state.expiresAt=Date.now()+Math.max(60,Number(response.expires_in||3500))*1000;
    state.error="";
    try{
      state.profile=await googleGet("oauth2/v3/userinfo");
    }catch(error){state.profile=null;throw error}
    state.loading=false;notify();
    await fetchCollections();
  }
  async function connect(){
    if(!state.configured)throw Error("La connexion Google doit d'abord être activée par le propriétaire de JabouTude dans Google Cloud. Aucun identifiant OAuth n'est encore configuré.");
    state.error="";state.loading=true;notify();
    try{
      await loadGoogle();
      if(!tokenClient){
        tokenClient=window.google.accounts.oauth2.initTokenClient({
          client_id:state.clientId,
          scope:"openid email profile https://www.googleapis.com/auth/youtube.readonly",
          callback:response=>{acceptToken(response).catch(fail)},
          error_callback:err=>fail(err?.message||err?.type||"Fenêtre de connexion Google fermée")
        });
      }
      tokenClient.requestAccessToken({prompt:"select_account"});
    }catch(error){fail(error);throw error}
  }
  function disconnect(){
    // Do not persist or reveal Google tokens; disconnect from this page only.
    state.token=null;state.profile=null;state.playlists=[];state.subscriptions=[];state.expiresAt=0;state.loading=false;state.error="";
    notify();
  }
  async function playlistItems(playlistId){
    if(!/^[A-Za-z0-9_-]{2,100}$/.test(String(playlistId||"")))throw Error("Playlist non valide");
    const data=await googleGet("youtube/v3/playlistItems?part=snippet,contentDetails&playlistId="+encodeURIComponent(playlistId)+"&maxResults=50");
    return (data.items||[]).map(x=>{
      const id=x.contentDetails?.videoId||x.snippet?.resourceId?.videoId;
      if(!/^[a-zA-Z0-9_-]{11}$/.test(String(id||"")))return null;
      const th=x.snippet?.thumbnails||{};
      return {id,title:x.snippet?.title||"Vidéo YouTube",author:x.snippet?.videoOwnerChannelTitle||"",thumb:th.medium?.url||th.default?.url||"https://i.ytimg.com/vi/"+id+"/hqdefault.jpg",duration:0};
    }).filter(Boolean);
  }
  window.JabouAuth={state,subscribe,init,connect,disconnect,playlistItems};
})();