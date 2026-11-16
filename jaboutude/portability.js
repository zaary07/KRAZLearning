"use strict";
/*
 * Google Data Portability API: separate OAuth scope solely for YouTube activity.
 * Consent is handled by Google. We never keep OAuth access tokens persistently.
 * Archive job IDs (not tokens or downloads) are saved per family member, so a
 * member can return later to retrieve an archive created by Google.
 */
(function(){
  const SCOPE="https://www.googleapis.com/auth/dataportability.myactivity.youtube";
  const ROOT="https://dataportability.googleapis.com/v1";
  let token="",expiresAt=0,client=null,loadPromise=null,active=false;
  const jobKey=member=>"jaboutube.portability.job.v1."+member;
  function readJob(member){
    try{
      const value=JSON.parse(localStorage.getItem(jobKey(member))||"null");
      if(value&&/^[A-Za-z0-9_.:-]{1,200}$/.test(value.id)&&Date.now()-value.created<14*86400000)return value;
    }catch{}
    return null;
  }
  function saveJob(member,job){
    localStorage.setItem(jobKey(member),JSON.stringify(job));
  }
  function clearJob(member){localStorage.removeItem(jobKey(member))}
  function loadGoogle(){
    if(window.google?.accounts?.oauth2)return Promise.resolve();
    if(loadPromise)return loadPromise;
    loadPromise=new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://accounts.google.com/gsi/client";
      script.async=true;
      script.onload=resolve;
      script.onerror=()=>reject(Error("Connexion Google indisponible."));
      document.head.appendChild(script);
    });
    return loadPromise;
  }
  async function authorize(clientId){
    await loadGoogle();
    return new Promise((resolve,reject)=>{
      client=window.google.accounts.oauth2.initTokenClient({
        client_id:clientId,
        scope:SCOPE,include_granted_scopes:false,
        callback:r=>{
          if(r?.error)return reject(Error(r.error_description||r.error));
          if(!r?.access_token)return reject(Error("Google n’a pas accordé le transfert de l’historique."));
          token=r.access_token;
          expiresAt=Date.now()+Math.max(30,Number(r.expires_in)||3500)*1000;
          resolve(token);
        },
        error_callback:r=>reject(Error(r?.message||r?.type||"Autorisation Google annulée"))
      });
      // The Data Portability scope must NEVER be mixed with the existing
      // openid, email, profile or youtube.readonly scopes.
      client.requestAccessToken({prompt:"consent",include_granted_scopes:false});
    });
  }
  function requireToken(){
    if(!token||Date.now()>=expiresAt-30000)throw Error("Autorisation Google expirée. Réessaie « Connecter mon historique ».");
    return token;
  }
  async function api(path,method="GET",body){
    const response=await fetch(ROOT+path,{
      method,
      headers:{"Authorization":"Bearer "+requireToken(),"Accept":"application/json",...(body?{"Content-Type":"application/json"}:{})},
      body:body?JSON.stringify(body):undefined,cache:"no-store"
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(payload.error?.message||"Google Data Portability HTTP "+response.status);
    return payload;
  }
  async function archiveFile(url,memberId){
    if(!/^https:\/\//i.test(url))throw Error("Lien d’archive Google invalide.");
    let blob=null;
    try{
      // Most signed Cloud Storage URLs do not support cross-origin access
      // from custom web apps; try a direct fetch first.
      const response=await fetch(url,{credentials:"omit",cache:"no-store",redirect:"error"});
      if(!response.ok)throw Error("Google Storage HTTP "+response.status);
      blob=await response.blob();
    }catch{
      const auth=window.JabouAuth?.getAccessToken?.();
      if(!auth)throw Error("Session familiale expirée pendant l’import.");
      const response=await fetch((window.JaboutubeApiBase||"")+"/api/portability/archive",{
        method:"POST",cache:"no-store",
        headers:{"authorization":"Bearer "+auth,"content-type":"application/json"},
        body:JSON.stringify({url})
      });
      if(!response.ok){
        const msg=await response.json().catch(()=>({}));
        throw Error(msg.error||"Impossible de télécharger l’archive Google.");
      }
      blob=await response.blob();
    }
    if(blob.size>180*1024*1024)throw Error("Archive trop volumineuse (180 Mo maximum).");
    // JSZip/File API parses locally, on the member's device.
    const buffer=await blob.slice(0,8).arrayBuffer();
    const b=new Uint8Array(buffer);
    const zip=b[0]===0x50&&b[1]===0x4b;
    const label=zip?"activite-youtube.zip":"activite-youtube.json";
    return new File([blob],label,{type:zip?"application/zip":"application/json"});
  }
  async function run(options){
    if(active)throw Error("Un transfert d’historique est déjà en cours.");
    const {clientId,memberId,onStatus,onFile}=options||{};
    if(!/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(String(clientId||"")))
      throw Error("Google OAuth n’est pas configuré.");
    if(!/^[\w-]{8,80}$/.test(String(memberId||"")))throw Error("Profil familial invalide.");
    if(typeof onFile!=="function")throw Error("Importateur JabouTube non disponible.");
    const notify=message=>{if(typeof onStatus==="function")onStatus(message)};
    active=true;
    try{
      notify("Google va demander l’autorisation de transférer uniquement ton activité YouTube. Choisis ton propre compte Google.");
      await authorize(clientId);
      const existing=readJob(memberId);
      let jobId=existing?.id||"";
      if(!jobId){
        notify("Demande de copie de ton historique YouTube à Google…");
        const initiated=await api("/portabilityArchive:initiate","POST",{resources:["myactivity.youtube"]});
        jobId=String(initiated.archiveJobId||"");
        if(!/^[A-Za-z0-9_.:-]{1,200}$/.test(jobId))throw Error("Google n’a pas renvoyé de numéro de transfert.");
        saveJob(memberId,{id:jobId,created:Date.now()});
      }
      notify("Vérification de l’archive Google…");
      const state=await api("/archiveJobs/"+encodeURIComponent(jobId)+"/portabilityArchiveState");
      if(state.state==="FAILED"||state.state==="CANCELLED")
        throw Error("Google a indiqué que l’exportation a échoué. Une nouvelle autorisation peut être nécessaire.");
      if(state.state!=="COMPLETE"){
        notify("Google prépare ton historique. Cela peut prendre plusieurs heures. Tu peux revenir ici et toucher « Récupérer mon historique Google » pour vérifier sans recommencer.");
        return {state:state.state||"IN_PROGRESS",jobId};
      }
      const urls=(state.urls||[]).filter(x=>typeof x==="string");
      if(!urls.length)throw Error("Google indique une archive terminée mais aucun fichier à télécharger.");
      if(urls.length>20)throw Error("L’export Google contient trop de fichiers pour cet import automatique.");
      let total=0;
      for(let i=0;i<urls.length;i++){
        if(window.JabouAuth?.state?.profile?.sub!==memberId)throw Error("Le compte familial a changé. Import interrompu.");
        notify("Téléchargement privé depuis Google : fichier "+(i+1)+"/"+urls.length+"…");
        const file=await archiveFile(urls[i],memberId);
        notify("Ajout de tes vidéos à ton accueil : fichier "+(i+1)+"/"+urls.length+"…");
        const imported=await onFile(file);
        total=Math.max(total,Number(imported?.count)||0);
      }
      clearJob(memberId);
      notify("Ton accueil JabouTube est personnalisé avec "+total+" vidéos retrouvées.");
      return {state:"COMPLETE",count:total};
    }finally{active=false;}
  }
  window.JabouPortability={run,readJob};
})();