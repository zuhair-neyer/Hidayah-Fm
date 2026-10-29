const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),publicDir=path.join(root,'public');
const catalogue=JSON.parse(fs.readFileSync(path.join(publicDir,'data/catalogue.json'),'utf8'));
const source=fs.readFileSync(path.join(publicDir,'js/catalogue.js'),'utf8');
let moduleId=0;
const freshModule=()=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+(++moduleId));
async function withStaticFetch(run,transform){
 const original=global.fetch,requests=[];
 global.fetch=async url=>{
  assert.match(url,/^\/data\/(?:catalogue\.json|quran\/[1-9][0-9]*\.json)$/,'Content must be loaded from bundled same-origin JSON.');
  requests.push(url);
  const value=JSON.parse(fs.readFileSync(path.join(publicDir,url),'utf8'));
  return new Response(JSON.stringify(transform?transform(url,value):value),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{await run(await freshModule(),requests);}finally{global.fetch=original;}
}

test('bundled Quran contains all 114 aligned chapters and 6,236 Arabic/English verses',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(publicDir,'data/quran/manifest.json'),'utf8'));
 assert.equal(manifest.surahs,114);assert.equal(manifest.ayahs,6236);
 assert.equal(manifest.arabic_edition,'quran-uthmani');assert.equal(manifest.translation_edition,'en.sahih');
 let globalNumber=0;
 for(const surah of catalogue.surahs){
  const bytes=fs.readFileSync(path.join(publicDir,'data/quran',surah.id+'.json'));
  const chapter=JSON.parse(bytes),entry=manifest.files.find(f=>f.surah_id===surah.id);
  assert.equal(chapter.surah_id,surah.id);assert.equal(chapter.ayahs.length,surah.ayah_count);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  for(const [i,ayah] of chapter.ayahs.entries()){
   assert.equal(ayah.number,i+1);assert.equal(ayah.global_number,++globalNumber);
   assert.match(ayah.arabic,/[\u0600-\u06ff]/);assert.ok(ayah.english.trim());
  }
 }
 assert.equal(globalNumber,6236);
});

test('static catalogue covers both complete collections, filters, searches and corrected audio roots',async()=>{
 await withStaticFetch(async(content,requests)=>{
  assert.deepEqual(await content.loadCatalogue(),catalogue);
  assert.equal(content.listSurahs().surahs.length,114);
  assert.equal(content.listSurahs({q:'Kahf'}).surahs[0].id,18);
  assert.ok(content.listSurahs({type:'Madani'}).surahs.every(s=>s.revelation_type==='Madani'));
  assert.ok(content.listSurahs(new URLSearchParams('juz=30')).surahs.every(s=>s.juz===30));
  assert.equal(content.listTracks().tracks.length,catalogue.tracks.length);
  for(const type of ['nasheed','naat'])assert.equal(content.listTracks({type}).tracks.length,60);
  assert.equal(content.listTracks({limit:'-1'}).tracks.length,1);
  const last=catalogue.tracks.at(-1);
  assert.ok(content.search(last.title).tracks.some(t=>t.id===last.id));
  assert.deepEqual(content.getTrack(last.id),last);
  assert.equal(content.listReciters().reciters.filter(r=>r.audio_available).length,6);
  assert.match(content.getSurah(114,{reciter:'maher_almuaiqly'}).audio_url,/server12\.mp3quran\.net\/maher\/114\.mp3$/);
  assert.match(content.getSurah(1,{reciter:'sa3d_al-ghaamidi'}).audio_url,/sa3d_al-ghaamidi\/complete\/001\.mp3$/);
  assert.match(content.getSurah(1,{reciter:'abu_bakr_ash-shatri'}).audio_url,/abu_bakr_ash-shaatree\/001\.mp3$/);
  assert.equal(content.getSurah(1,{reciter:'omar_hisham_al_arabi'}).audio_url,null);
  assert.deepEqual(requests,['/data/catalogue.json']);
 });
});

test('static content preserves item IDs and reciters when enriching saved library records',async()=>{
 await withStaticFetch(async content=>{
  await content.loadCatalogue();
  const row={id:'saved-entry',item_type:'surah',item_id:18,reciter_id:3};
  assert.deepEqual(content.parseItem(row),{item_type:'surah',item_id:18,reciter_id:3});
  const enriched=content.enrich(row);
  assert.equal(enriched.entry_id,row.id);assert.equal(enriched.id,18);assert.equal(enriched.reciter_id,3);
  assert.equal(enriched.title,'Surah Al-Kahf');assert.match(enriched.audio_url,/018\.mp3$/);
  const track=catalogue.tracks.at(-1),saved=content.enrich({id:'recording-entry',item_type:'track',item_id:track.id});
  assert.equal(saved.id,track.id);assert.equal(saved.title,track.title);assert.equal(saved.link_url,track.link_url);assert.equal(saved.audio_url,track.audio_url);
  assert.ok(content.parseItem({item_type:'surah',item_id:115}).error);
  assert.ok(content.parseItem({item_type:'surah',item_id:1,reciter_id:9999}).error);
  assert.ok(content.parseItem({item_type:'track',item_id:99999}).error);
  assert.equal(content.enrich({item_type:'track',item_id:99999}),null);
  assert.throws(()=>content.getSurah(0),e=>e.status===400);
  assert.throws(()=>content.getReciter('missing'),e=>e.status===404);
  const mutable=await content.loadCatalogue();mutable.tracks[0].title='A local view change';
  assert.equal(content.getTrack(catalogue.tracks[0].id).title,catalogue.tracks[0].title);
 });
});

test('reader loads local text once, returns independent snapshots and retries invalid content',async()=>{
 let invalid=true;
 await withStaticFetch(async(content,requests)=>{
  const chapter=await content.getAyahs(1);
  assert.equal(chapter.ayahs.length,7);chapter.ayahs[0].english='changed in view';
  assert.notEqual((await content.getAyahs(1)).ayahs[0].english,'changed in view');
  assert.equal(requests.filter(url=>url==='/data/quran/1.json').length,1);
  await assert.rejects(content.getAyahs(2),e=>e.status===503);
  invalid=false;
  assert.equal((await content.getAyahs(2)).ayahs.length,286);
  assert.equal(requests.filter(url=>url==='/data/quran/2.json').length,2);
  await assert.rejects(content.getAyahs(115),e=>e.status===400);
 },(url,value)=>{if(url==='/data/quran/2.json'&&invalid)value.ayahs.pop();return value;});
});

test('public catalogue exports only public content columns and records source links',()=>{
 const allowed={surahs:['id','name_en','name_ar','meaning','ayah_count','revelation_type','juz'],reciters:['id','name','name_ar','slug','country','style','image_url','audio_available','audio_base_url','link_url'],tracks:['id','title','artist','type','language','mood','cover_url','audio_url','link_url','duration','plays']};
 assert.deepEqual(Object.keys(catalogue).sort(),['reciters','surahs','tracks','version']);
 for(const [kind,keys] of Object.entries(allowed))for(const row of catalogue[kind])assert.ok(Object.keys(row).every(key=>keys.includes(key)),kind+' has an unexpected field');
 assert.equal(catalogue.tracks.filter(t=>t.link_url?.startsWith('https://www.youtube.com/watch?v=')).length,118);
});
