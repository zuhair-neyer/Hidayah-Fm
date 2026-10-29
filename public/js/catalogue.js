// Public content is served as static JSON. Account data is handled separately by Firebase.
let catalogue=null,loading=null;
const chapters=new Map(),chapterLoads=new Map();
const failure=(message,status=400)=>Object.assign(new Error(message),{status});
const copy=value=>structuredClone(value);
const parameters=value=>value instanceof URLSearchParams?Object.fromEntries(value):value||{};
const contains=(value,query)=>String(value||'').toLowerCase().includes(query.toLowerCase());
const sourceLink=query=>'https://www.youtube.com/results?search_query='+encodeURIComponent(query);

async function asset(url){
 let response;
 try{response=await fetch(url,{signal:AbortSignal.timeout(20000)});}
 catch{throw failure('The requested content could not be loaded. Check your connection and try again.',503);}
 if(!response.ok)throw failure('The requested content could not be loaded. Please refresh and try again.',response.status===404?404:503);
 try{return await response.json();}catch{throw failure('The content file is invalid. Please refresh and try again.',503);}
}

export async function loadCatalogue(){
 if(catalogue)return copy(catalogue);
 if(!loading)loading=(async()=>{
  const data=await asset('/data/catalogue.json');
  if(!Array.isArray(data.surahs)||data.surahs.length!==114||!Array.isArray(data.reciters)||!data.reciters.length||!Array.isArray(data.tracks))throw failure('The catalogue is incomplete. Please refresh and try again.',503);
  if(data.surahs.some((s,i)=>s.id!==i+1)||data.surahs.reduce((n,s)=>n+s.ayah_count,0)!==6236)throw failure('The Quran catalogue is incomplete.',503);
  for(const kind of ['surahs','reciters','tracks'])if(new Set(data[kind].map(r=>r.id)).size!==data[kind].length)throw failure('The catalogue contains duplicate IDs.',503);
  catalogue=data;
  return data;
 })().finally(()=>{loading=null;});
 return copy(await loading);
}

function data(){if(!catalogue)throw failure('The catalogue is still loading. Please try again.',503);return catalogue;}
function chapterId(value){const id=Number(value);if(!Number.isInteger(id)||id<1||id>114)throw failure('Surah id must be between 1 and 114');return id;}
function pickReciter(value){return data().reciters.find(r=>r.id===Number(value)||r.slug===value)||data().reciters[0];}
function audio(reciter,id){return reciter?.audio_base_url?reciter.audio_base_url+String(id).padStart(3,'0')+'.mp3':null;}
function briefReciter(reciter){return {id:reciter.id,name:reciter.name,slug:reciter.slug};}
function surahMatches(surah,query){return contains(surah.name_en,query)||contains(surah.name_ar,query)||contains(surah.meaning,query)||String(surah.id)===query;}

export function listSurahs(params={}){
 const {type,juz,q,reciter:requested}=parameters(params),reciter=pickReciter(requested),query=String(q||'').trim();
 const surahs=data().surahs.filter(s=>(!['Makki','Madani'].includes(type)||s.revelation_type===type)&&(!juz||Number.isNaN(Number(juz))||s.juz===Number(juz))&&(!query||surahMatches(s,query)));
 return {reciter:briefReciter(reciter),surahs:surahs.map(s=>({...copy(s),audio_url:audio(reciter,s.id)}))};
}

export function getSurah(value,params={}){
 const id=chapterId(value),surah=data().surahs.find(s=>s.id===id),reciter=pickReciter(parameters(params).reciter);
 if(!surah)throw failure('Surah not found',404);
 return {...copy(surah),reciter:briefReciter(reciter),audio_url:audio(reciter,id)};
}

export async function getAyahs(value){
 const id=chapterId(value);
 await loadCatalogue();
 if(chapters.has(id))return copy(chapters.get(id));
 if(!chapterLoads.has(id))chapterLoads.set(id,(async()=>{
  const chapter=await asset('/data/quran/'+id+'.json');
  const expected=data().surahs[id-1].ayah_count,start=data().surahs.slice(0,id-1).reduce((n,s)=>n+s.ayah_count,0);
  if(chapter.surah_id!==id||!Array.isArray(chapter.ayahs)||chapter.ayahs.length!==expected||chapter.ayahs.some((a,i)=>a.number!==i+1||a.global_number!==start+i+1||typeof a.arabic!=='string'||!a.arabic.trim()||typeof a.english!=='string'||!a.english.trim()))throw failure('This chapter is incomplete. Please refresh and try again.',503);
  chapters.set(id,chapter);return chapter;
 })().finally(()=>chapterLoads.delete(id)));
 return copy(await chapterLoads.get(id));
}

export function listReciters(){return {reciters:copy(data().reciters)};}
export function getReciter(value){const reciter=data().reciters.find(r=>r.id===Number(value)||r.slug===value);if(!reciter)throw failure('Reciter not found',404);return copy(reciter);}
export function getTrack(value){const track=data().tracks.find(t=>t.id===Number(value));if(!track)throw failure('Track not found',404);return copy(track);}

export function listTracks(params={}){
 const {type:requested,language,mood,q,limit:requestedLimit}=parameters(params),rawType=String(requested||'').toLowerCase();
 const type=rawType.startsWith('nasheed')?'nasheed':rawType.startsWith('na')?'naat':null;
 const limit=Math.max(1,Math.min(Math.floor(Number(requestedLimit))||200,200)),query=String(q||'').trim();
 const tracks=data().tracks.filter(t=>(!type||t.type===type)&&(!language||t.language===language)&&(!mood||t.mood===mood)&&(!query||contains(t.title,query)||contains(t.artist,query)));
 return {tracks:copy(tracks.sort((a,b)=>(b.plays||0)-(a.plays||0)||a.id-b.id).slice(0,limit))};
}

export function search(value){
 const query=String(value||'').trim();
 if(!query)return {surahs:[],reciters:[],tracks:[]};
 return {
  surahs:copy(data().surahs.filter(s=>surahMatches(s,query)).slice(0,20)),
  reciters:copy(data().reciters.filter(r=>contains(r.name,query)||contains(r.name_ar,query)).slice(0,10)),
  tracks:copy(data().tracks.filter(t=>contains(t.title,query)||contains(t.artist,query)).slice(0,10))
 };
}

export function parseItem(src){
 const item_type=src?.item_type,item_id=Number(src?.item_id);
 if(!['surah','track'].includes(item_type)||!Number.isSafeInteger(item_id)||item_id<1)return {error:'item_type must be "surah" or "track" and item_id a number'};
 if(item_type==='surah'){
  if(!data().surahs.some(s=>s.id===item_id))return {error:'Surah not found'};
  if(src.reciter_id!=null&&(!Number.isSafeInteger(Number(src.reciter_id))||Number(src.reciter_id)<1))return {error:'Invalid reciter id'};
  const reciter=src.reciter_id!=null?data().reciters.find(r=>r.id===Number(src.reciter_id)):data().reciters[0];
  if(!reciter)return {error:'Reciter not found'};
  return {item_type,item_id,reciter_id:reciter.id};
 }
 if(!data().tracks.some(t=>t.id===item_id))return {error:'Track not found'};
 return {item_type,item_id,reciter_id:null};
}

export function enrich(row){
 if(row?.item_type==='surah'){
  const surah=data().surahs.find(s=>s.id===Number(row.item_id)),reciter=pickReciter(row.reciter_id);
  if(!surah||!reciter)return null;
  const audio_url=audio(reciter,surah.id);
  return {entry_id:row.id,type:'surah',id:surah.id,reciter_id:reciter.id,title:'Surah '+surah.name_en,title_ar:surah.name_ar,subtitle:reciter.name,audio_url,link_url:audio_url?null:sourceLink(reciter.name+' '+surah.name_en),cover_url:null};
 }
 if(row?.item_type!=='track')return null;
 const track=data().tracks.find(t=>t.id===Number(row.item_id));
 if(!track)return null;
 return {entry_id:row.id,type:'track',id:track.id,reciter_id:null,title:track.title,title_ar:null,subtitle:track.artist,track_type:track.type,audio_url:track.audio_url,link_url:track.link_url,cover_url:track.cover_url};
}
