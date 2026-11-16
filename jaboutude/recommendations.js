"use strict";
/* JabouTube personalized discovery: profiles stay on the device.
   Only short public-topic searches (not browsing history or account tokens)
   are sent to upstream search services. YouTube OAuth calls go to Google directly. */
(function(){
  const STOP=new Set(("the a an and or this that with from for into about over " +
    "les des une un aux dans pour sur avec plus sans vous nous leur mais " +
    "est sont tout tous officiel official video vidéo vidéos clip full hd 4k " +
    "2026 2025 2024 2023 episode épisode part partie version extended " +
    "best top new latest youtube audio original feat ft remix live music musique " +
    "de du la le et en au a d l un et ou ce ces sa ses sur y to of in " +
    "my your it is at as by vs episode music song track 1080p 720p").split(/\s+/));
  const fallback=["nouveautés musique","documentaires","technologie","cinéma","voyage","gaming","science","cuisine"];
  function words(value){
    return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9\s]/g," ").split(/\s+/)
      .filter(w=>w.length>=3&&w.length<24&&!STOP.has(w)&&!/^\d+$/.test(w));
  }
  function buildProfile(history,favorites,subscriptions){
    const tokens=new Map(),phrases=new Map(),channels=new Map();
    function bump(map,key,points){
      if(!key||key.length>75)return;
      map.set(key,(map.get(key)||0)+points);
    }
    function watch(item,index,isFav=false){
      if(!item||typeof item!=="object")return;
      const title=words(item.title).slice(0,13);
      const base=(isFav?5:index<20?3.7:index<90?2.5:index<250?1.5:0.65)
        *(1+Math.min(0.8,Math.log1p(Math.min(50,Number(item.watchCount)||0))/7));
      const distinct=[...new Set(title)];
      for(const w of distinct)bump(tokens,w,base/Math.max(1,Math.sqrt(distinct.length)));
      for(let i=0;i<title.length-1;i++){
        if(title[i]!==title[i+1])bump(phrases,title[i]+" "+title[i+1],base*0.9);
      }
      const channel=String(item.author||"").trim().replace(/ - Topic$/i,"");
      if(channel.length>=3&&channel.length<=65)bump(channels,channel,base*0.55);
    }
    (history||[]).slice(0,700).forEach((v,i)=>watch(v,i));
    (favorites||[]).slice(0,100).forEach((v,i)=>watch(v,i,true));
    for(const sub of (subscriptions||[]).slice(0,75)){
      const title=sub?.snippet?.title||sub?.title||"";
      if(title.length>=3&&title.length<=65)bump(channels,title,4);
    }
    const sorted=map=>[...map].sort((a,b)=>b[1]-a[1]);
    const tokenTop=sorted(tokens).filter(([,s])=>s>1).slice(0,45);
    const phraseTop=sorted(phrases).filter(([,s])=>s>3).slice(0,55);
    const channelTop=sorted(channels).filter(([,s])=>s>2).slice(0,32);
    const queries=[];
    function add(q,kind){
      const clean=String(q||"").trim().slice(0,85);
      if(clean&&queries.every(x=>x.q.toLowerCase()!==clean.toLowerCase()))
        queries.push({q:clean,kind});
    }
    // Blend familiar subjects, subscribed creators and exploratory topics.
    for(let i=0;i<Math.max(6,Math.min(12,phraseTop.length+channelTop.length));i++){
      if(i%3===0&&channelTop[Math.floor(i/3)])add(channelTop[Math.floor(i/3)][0],"creator");
      if(phraseTop[i])add(phraseTop[i][0],"topic");
    }
    for(const [w] of tokenTop.slice(0,6))if(w.length>=5)add(w,"interest");
    if(!queries.length)for(const q of fallback)add(q,"explore");
    else for(const q of fallback.slice(0,3))add(q,"explore");
    return {queries:queries.slice(0,23),tokens:new Map(tokenTop),channels:channelTop.map(x=>x[0])};
  }
  function score(item,profile,watchedIds){
    const w=words(item.title);
    let count=0;
    for(const word of new Set(w))count+=Math.min(4,profile.tokens.get(word)||0);
    const channel=String(item.author||"").toLowerCase();
    const creator=profile.channels.some(c=>c.toLowerCase()===channel)?8:0;
    return count+creator+(Number(item.views||0)>0?Math.log10(Math.max(1,item.views))/4:0)
      -(watchedIds.has(item.id)?12:0);
  }
  async function googleSearch(term,token,pageToken="",signal){
    const params=new URLSearchParams({part:"snippet",q:term,type:"video",
      maxResults:"40",regionCode:"FR",videoEmbeddable:"true",safeSearch:"moderate"});
    if(pageToken)params.set("pageToken",pageToken);
    const response=await fetch("https://www.googleapis.com/youtube/v3/search?"+params,
      {headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal,cache:"no-store"});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(body?.error?.message||"YouTube API "+response.status);
    const items=(body.items||[]).map(v=>{
      const id=String(v.id?.videoId||"");
      if(!/^[\w-]{11}$/.test(id))return null;
      const snippet=v.snippet||{};
      return {id,title:snippet.title||"Vidéo YouTube",author:snippet.channelTitle||"",
        thumb:snippet.thumbnails?.medium?.url||snippet.thumbnails?.high?.url||"https://i.ytimg.com/vi/"+id+"/hqdefault.jpg",
        duration:0,views:0,publishedAt:snippet.publishedAt||"",source:"YouTube"};
    }).filter(Boolean);
    return {items,nextPageToken:String(body.nextPageToken||""),source:"youtube"};
  }
  window.JabouFeed={buildProfile,score,googleSearch};
})();