"use strict";
(function(){
  const state={clientId:"",configured:false,token:null,profile:null,playlists:[],subscriptions:[],expiresAt:0,loading:false,error:"",youtubeConnected:false,familyOnly:true,familyReady:false,authorized:false,inviteOnly:false,familySession:null,googleProfile:null};

  const FAMILY_SESSION_KEY="jaboutube.family.session.v1";
  const apiBase=()=>window.JaboutubeApiBase||"";
  async function inviteApi(path,options={}){
    const response=await fetch(apiBase()+"/api"+path,{cache:"no-store",...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||"Session familiale indisponible.");
    return data;
  }
  async function restoreInviteSession(){
    state.loading=true;state.authorized=false;state.profile=null;state.familySession=null;notify();
    try{
      const params=new URLSearchParams(location.hash.replace(/^#/,""));
      const invite=params.get("invite");
      if(invite){
        // Remove the invitation token from the visible URL before sending it.
        history.replaceState(null,"",location.pathname+location.search);
        const result=await inviteApi("/family/claim",{
          method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({invite})
        });
        state.familySession=result.session;
        localStorage.setItem(FAMILY_SESSION_KEY,JSON.stringify({session:result.session,profile:result.profile}));
      }else{
        try{
          const saved=JSON.parse(localStorage.getItem(FAMILY_SESSION_KEY)||"null");
          state.familySession=String(saved?.session||"")||null;
        }catch{localStorage.removeItem(FAMILY_SESSION_KEY)}
      }
      if(state.familySession){
        const who=await inviteApi("/me",{headers:{authorization:"Bearer "+state.familySession}});
        state.profile=who.user;
        state.authorized=true;state.error="";
      }else{
        state.error="Pour rejoindre JabouTube, ouvre le lien personnel envoyé par le propriétaire de la famille.";
      }
    }catch(error){
      localStorage.removeItem(FAMILY_SESSION_KEY);
      state.familySession=null;state.profile=null;state.authorized=false;
      state.error=String(error?.message||error);
    }finally{state.loading=false;notify()}
  }

  const listeners=new Set();
  let loginClient=null,youtubeClient=null,scriptPromise=null;
  const notify=()=>listeners.forEach(fn=>{try{fn({...state})}catch(e){console.warn("Auth UI",e)}});
  const subscribe=fn=>{listeners.add(fn);fn({...state});return()=>listeners.delete(fn)};
  const fail=(error)=>{state.loading=false;state.error=String(error?.message||error||"Erreur de connexion Google");notify()};
  async function init(){
    try{
      const resp=await fetch((window.JaboutubeApiBase||"")+"/api/config",{credentials:"same-origin",cache:"no-store"});
      if(!resp.ok)throw Error("Configuration inaccessible");
      const d=await resp.json();
      state.clientId=String(d.googleClientId||"");
      state.configured=!!d.googleConfigured;
      state.familyOnly=!!d.familyOnly;
      state.familyReady=!!d.familyReady;
      state.inviteOnly=!!d.inviteOnly;
      notify();
      if(state.inviteOnly){await restoreInviteSession();return;}
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

  const YT_SCOPE="https://www.googleapis.com/auth/youtube.readonly";
  async function fetchCollections(){
    if(!state.youtubeConnected)return;
    const requests=await Promise.allSettled([
      googleGet("youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50"),
      googleGet("youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50")
    ]);
    state.playlists=requests[0].status==="fulfilled"?requests[0].value.items||[]:[];
    state.subscriptions=requests[1].status==="fulfilled"?requests[1].value.items||[]:[];
    if(requests.some(x=>x.status==="rejected"))
      state.error="Google est connecté, mais certaines données YouTube ne sont pas accessibles. L’autorisation YouTube peut nécessiter la vérification de JabouTube par Google.";
    state.loading=false;notify();
  }
  async function acceptLogin(response){
    if(response.error)throw Error(response.error_description||response.error);
    if(!response.access_token)throw Error("Aucun jeton Google reçu.");
    state.token=response.access_token;
    state.expiresAt=Date.now()+Math.max(60,Number(response.expires_in||3500))*1000;
    state.error="";state.youtubeConnected=false;
    state.playlists=[];state.subscriptions=[];
    let profile=await googleGet("oauth2/v3/userinfo");
    if(state.inviteOnly){
      if(!state.authorized||!state.familySession)throw Error("Ouvre d’abord ton lien personnel JabouTube.");
      state.googleProfile=profile;
      state.loading=false;notify();return;
    }
    if(state.familyOnly){
      if(!state.familyReady)throw Error("Accès familial à configurer par le propriétaire.");
      const verified=await fetch((window.JaboutubeApiBase||"")+"/api/me",{headers:{Authorization:"Bearer "+state.token,Accept:"application/json"},cache:"no-store"});
      const data=await verified.json().catch(()=>({}));
      if(!verified.ok||!data.user?.sub)throw Error(data.error||"Ce compte n’a pas été invité à JabouTube.");
      profile={...profile,...data.user};
    }
    state.profile=profile;
    state.authorized=true;
    state.loading=false;notify();
  }
  async function acceptYoutube(response){
    if(response.error)throw Error(response.error_description||response.error);
    if(!response.access_token)throw Error("Autorisation YouTube non reçue.");
    if(!window.google.accounts.oauth2.hasGrantedAllScopes(response,YT_SCOPE)){
      state.loading=false;
      state.error="Tu n’as pas autorisé YouTube. Ton compte Google reste connecté.";
      notify();return;
    }
    // In private invitation mode, Google is linked to a family profile,
    // not used to replace that profile or its private access token.
    if(state.inviteOnly&&(!state.authorized||!state.familySession))
      throw Error("Rejoins d’abord ton espace familial avec ton invitation.");
    const prior=state.inviteOnly?state.googleProfile?.sub:state.profile?.sub;
    const nextToken=response.access_token;
    const nextProfileResponse=await fetch("https://www.googleapis.com/oauth2/v3/userinfo",{headers:{Authorization:"Bearer "+nextToken},cache:"no-store"});
    const nextProfile=await nextProfileResponse.json().catch(()=>({}));
    if(!nextProfileResponse.ok||!nextProfile.sub)
      throw Error("Impossible de vérifier le compte Google choisi.");
    if(prior&&prior!==nextProfile.sub&&!state.inviteOnly)
      throw Error("Choisis le même compte Google pour YouTube et JabouTube.");
    if(state.familyOnly&&!state.inviteOnly){
      const access=await fetch((window.JaboutubeApiBase||"")+"/api/me",{headers:{Authorization:"Bearer "+nextToken},cache:"no-store"});
      if(!access.ok)throw Error("Compte familial non autorisé.");
    }
    state.googleProfile=nextProfile;
    state.token=nextToken;
    state.expiresAt=Date.now()+Math.max(60,Number(response.expires_in||3500))*1000;
    state.youtubeConnected=true;state.error="";notify();
    await fetchCollections();
  }
  async function connect(){
    if(state.inviteOnly&&!state.authorized)throw Error("Ouvre d’abord ton lien personnel JabouTube.");
    if(!state.configured)throw Error("Connexion Google non configurée : il manque GOOGLE_CLIENT_ID sur Render.");
    state.error="";state.loading=true;notify();
    try{
      await loadGoogle();
      if(!loginClient){
        loginClient=window.google.accounts.oauth2.initTokenClient({
          client_id:state.clientId,
          scope:"openid email profile",
          callback:r=>acceptLogin(r).catch(fail),
          error_callback:r=>fail(r?.message||r?.type||"Connexion Google annulée")
        });
      }
      loginClient.requestAccessToken({prompt:"select_account"});
    }catch(error){fail(error);throw error}
  }
  async function connectYoutube(){
    if(!state.configured)throw Error("Le propriétaire doit configurer le Client ID Google OAuth sur Render et activer YouTube Data API v3.");
    if(state.inviteOnly&&!state.authorized)throw Error("Ouvre d’abord ton lien familial.");
    if(!state.inviteOnly&&!state.profile)throw Error("Connecte d’abord ton compte Google.");
    state.error="";state.loading=true;notify();
    try{
      await loadGoogle();
      if(!youtubeClient){
        youtubeClient=window.google.accounts.oauth2.initTokenClient({
          client_id:state.clientId,
          scope:"openid email profile "+YT_SCOPE,
          callback:r=>acceptYoutube(r).catch(fail),
          error_callback:r=>fail(r?.message||r?.type||"Autorisation YouTube annulée")
        });
      }
      youtubeClient.requestAccessToken({prompt:"consent"});
    }catch(error){fail(error);throw error}
  }
  function disconnect(){
    if(state.inviteOnly)localStorage.removeItem(FAMILY_SESSION_KEY);
    state.familySession=null;
    state.token=null;state.profile=null;state.googleProfile=null;state.playlists=[];state.subscriptions=[];state.youtubeConnected=false;state.authorized=false;state.expiresAt=0;state.loading=false;
    state.error=state.inviteOnly?"Ouvre à nouveau une invitation familiale valide pour rejoindre JabouTube.":"";
    notify();
  }
  function disconnectGoogle(){
    state.token=null;state.googleProfile=null;state.expiresAt=0;
    state.playlists=[];state.subscriptions=[];state.youtubeConnected=false;
    state.loading=false;state.error="";notify();
  }
  async function playlistItems(playlistId){
    if(!state.youtubeConnected)throw Error("Autorise l’accès à YouTube avant d’ouvrir une playlist.");
    if(!/^[A-Za-z0-9_-]{2,100}$/.test(String(playlistId||"")))throw Error("Playlist non valide");
    const data=await googleGet("youtube/v3/playlistItems?part=snippet,contentDetails&playlistId="+encodeURIComponent(playlistId)+"&maxResults=50");
    return (data.items||[]).map(x=>{
      const id=x.contentDetails?.videoId||x.snippet?.resourceId?.videoId;
      if(!/^[a-zA-Z0-9_-]{11}$/.test(String(id||"")))return null;
      const th=x.snippet?.thumbnails||{};
      return {id,title:x.snippet?.title||"Vidéo YouTube",author:x.snippet?.videoOwnerChannelTitle||"",thumb:th.medium?.url||th.default?.url||"https://i.ytimg.com/vi/"+id+"/hqdefault.jpg",duration:0};
    }).filter(Boolean);
  }
  function getAccessToken(){
    if(state.inviteOnly)return state.authorized?state.familySession:null;
    return state.authorized&&state.token&&Date.now()<state.expiresAt-12000?state.token:null;
  }
  window.JabouAuth={state,subscribe,init,connect,connectYoutube,disconnect,disconnectGoogle,playlistItems,getAccessToken};
})();