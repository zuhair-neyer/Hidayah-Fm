// Migration validates references against the active static catalogue, not retained SQLite.
const fs=require('node:fs');
const path=require('node:path');
const defaultCatalogue=path.resolve(__dirname,'../../public/data/catalogue.json');

function createItemParser(catalogue){
 const ids={};
 for(const kind of ['surahs','reciters','tracks']){
  const rows=catalogue?.[kind];
  if(!Array.isArray(rows)||rows.some(row=>!Number.isSafeInteger(row?.id)||row.id<1))throw new Error('The active public catalogue contains invalid '+kind+' IDs.');
  ids[kind]=new Set(rows.map(row=>row.id));
  if(ids[kind].size!==rows.length)throw new Error('The active public catalogue contains duplicate '+kind+' IDs.');
 }
 const firstReciter=Math.min(...ids.reciters);
 return function parseItem(src){
  const item_type=src?.item_type,item_id=Number(src?.item_id);
  if(!['surah','track'].includes(item_type)||!Number.isSafeInteger(item_id)||item_id<1)return {error:'item_type must be "surah" or "track" and item_id a number'};
  if(item_type==='surah'){
   if(!ids.surahs.has(item_id))return {error:'Surah not found'};
   if(src.reciter_id!=null&&(!Number.isSafeInteger(Number(src.reciter_id))||Number(src.reciter_id)<1))return {error:'Invalid reciter id'};
   const reciter_id=src.reciter_id!=null?Number(src.reciter_id):firstReciter;
   if(!ids.reciters.has(reciter_id))return {error:'Reciter not found'};
   return {item_type,item_id,reciter_id};
  }
  if(!ids.tracks.has(item_id))return {error:'Track not found'};
  return {item_type,item_id,reciter_id:null};
 };
}

function loadItemParser(file=defaultCatalogue){return createItemParser(JSON.parse(fs.readFileSync(file,'utf8')));}
module.exports={createItemParser,loadItemParser};
