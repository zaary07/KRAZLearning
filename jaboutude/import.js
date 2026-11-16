"use strict";
/* Reads the user's own Google Takeout ZIP locally in their browser.
   Never uploads their export or archive to JabouTube, Render, or a third party. */
(function(){
  const MAX_ARCHIVE_BYTES=180*1024*1024;
  const MAX_HISTORY_BYTES=75*1024*1024;
  const MAX_WATCH_EVENTS=150000;
  function normalize(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
  function isHistory(name){
    const last=normalize(name.split("/").pop()||"");
    if(!/\.(json|html?)$/.test(last))return false;
    if(/search|recherch|comment|likes|abonn/.test(last))return false;
    const regular=/watch[-_ ]?history|historique.*(video|visionnage|regard)|historique[-_ ]?des[-_ ]?visionnag|video[-_ ]?history/.test(last);
    // Data Portability exports YouTube activity under My Activity/YouTube/MyActivity.json.
    const portability=/myactivity|mon activite|my[-_ ]?activity/.test(last)
      &&/youtube|you tube/.test(normalize(name));
    return regular||portability;
  }
  function idFromUrl(input){
    try{
      const url=new URL(String(input||""));
      const host=url.hostname.toLowerCase();
      if(["www.youtube.com","youtube.com","m.youtube.com","music.youtube.com"].includes(host)){
        const id=url.searchParams.get("v")||"";
        return /^[\w-]{11}$/.test(id)?id:"";
      }
      if(host==="youtu.be"){
        const id=url.pathname.slice(1,12);
        return /^[\w-]{11}$/.test(id)?id:"";
      }
    }catch{}
    return "";
  }
  function parseHtml(html){
    if(typeof DOMParser!=="function")throw Error("Ce navigateur ne permet pas de lire le format HTML Takeout. Choisis JSON dans Google Takeout.");
    const dom=new DOMParser().parseFromString(html,"text/html"),items=[];
    for(const a of dom.querySelectorAll('a[href*="watch?v="],a[href*="youtu.be/"]')){
      if(items.length>=MAX_WATCH_EVENTS)break;
      const id=idFromUrl(a.href);
      if(!id)continue;
      const container=a.closest(".content-cell")||a.parentElement||a;
      const links=container.querySelectorAll("a");
      const author=[...links].filter(x=>x!==a&&!idFromUrl(x.href))[0]?.textContent?.trim()||"";
      const text=container.textContent||"";
      const dateLike=text.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s+\w+\s+\d{1,2},?\s+\d{4}[^\n]*/i);
      const parsedTime=dateLike?Date.parse(dateLike[0]):NaN;
      items.push({id,title:a.textContent.trim().slice(0,300)||"Vidéo YouTube",author:author.slice(0,140),
        watchedAt:Number.isFinite(parsedTime)?new Date(parsedTime).toISOString():""});
    }
    return items;
  }
  async function parseFile(file){
    if(!file||typeof file!=="object")throw Error("Sélectionne ton fichier d’historique.");
    if(Number(file.size)>MAX_ARCHIVE_BYTES)throw Error("Archive trop volumineuse (maximum 180 Mo). Exporte uniquement l’historique YouTube.");
    const filename=normalize(file.name);
    if(/\.json$/.test(filename)){
      const json=JSON.parse(await file.text());
      return {data:json,source:"json"};
    }
    if(/\.html?$/.test(filename)){
      const parsed=parseHtml(await file.text());
      if(!parsed.length)throw Error("Aucune vidéo trouvée dans l’historique HTML.");
      return {data:parsed,source:"html"};
    }
    if(!/\.zip$/.test(filename))throw Error("Sélectionne un fichier Google Takeout ZIP, JSON ou HTML.");
    if(typeof window.JSZip?.loadAsync!=="function")throw Error("Le lecteur ZIP n’est pas chargé. Actualise JabouTube.");
    const archive=await window.JSZip.loadAsync(file,{checkCRC32:false});
    const candidates=Object.values(archive.files)
      .filter(entry=>!entry.dir&&isHistory(entry.name))
      .sort((a,b)=>{
        const aJson=/\.json$/i.test(a.name),bJson=/\.json$/i.test(b.name);
        return Number(bJson)-Number(aJson);
      });
    if(!candidates.length)throw Error("Cette archive ne contient pas l’historique des vidéos regardées. Dans Google Takeout, choisis « YouTube et YouTube Music » puis « Historique ».");
    const selected=candidates[0];
    const approxSize=Number(selected?._data?.uncompressedSize)||0;
    if(approxSize>MAX_HISTORY_BYTES)throw Error("L’historique contenu dans ce ZIP dépasse 75 Mo. Crée un export ciblé sur l’historique.");
    const content=await selected.async("string");
    if(content.length>MAX_HISTORY_BYTES)throw Error("Historique trop volumineux (75 Mo maximum).");
    let data=/\.json$/i.test(selected.name)?JSON.parse(content):parseHtml(content);
    if(!Array.isArray(data)&&!Array.isArray(data?.history))throw Error("Fichier d’historique absent ou invalide dans l’archive.");
    if(/myactivity|mon activite|my[-_ ]?activity/i.test(selected.name)){
      const list=Array.isArray(data)?data:data.history;
      // Data Portability contains searches/ads as well as actual viewing.
      // Import YouTube WATCH activity only, never non-viewing actions.
      data=list.filter(x=>{
        const title=normalize(x?.title||"");
        const controls=normalize((x?.activityControls||[]).join(" "));
        return !!idFromUrl(x?.titleUrl)
          &&(/^(watched|vous avez regarde|regarde|visionne)/.test(title)
              ||/youtube watch history|historique des videos regardees/.test(controls));
      });
    }
    return {data,source:"zip",fileName:selected.name};
  }
  window.JabouImport={parseFile};
})();