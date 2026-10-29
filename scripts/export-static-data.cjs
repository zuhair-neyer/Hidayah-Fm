// Build public JSON assets. SQLite is read only when explicitly importing an existing catalogue.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'public','data');
const catalogueFile=path.join(output,'catalogue.json');
const {describeReciter}=require('../server/utils/audio');

function validateCatalogue(data){
 if(!data||!Array.isArray(data.surahs)||!Array.isArray(data.reciters)||!Array.isArray(data.tracks))throw new Error('Invalid public catalogue.');
 if(data.surahs.length!==114||data.surahs.reduce((sum,s)=>sum+s.ayah_count,0)!==6236)throw new Error('The catalogue must contain all 114 surahs and 6,236 verses.');
 for(const [index,surah] of data.surahs.entries())if(surah.id!==index+1)throw new Error('Surah IDs must be ordered from 1 to 114.');
 for(const kind of ['surahs','reciters','tracks']){
  const ids=data[kind].map(item=>item.id);
  if(ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length)throw new Error('Invalid or duplicate '+kind+' IDs.');
 }
 if(!data.reciters.length)throw new Error('At least one reciter is required.');
 if(data.tracks.some(t=>!['nasheed','naat'].includes(t.type)||!t.title||!t.artist))throw new Error('Invalid recording metadata.');
 return data;
}

function readSqlite(){
 const Database=require('better-sqlite3');
 const dataDir=path.resolve(process.env.DATA_DIR||path.join(root,'data'));
 const db=new Database(path.join(dataDir,'hidayah-catalogue.db'),{readonly:true,fileMustExist:true});
 try{
  // Explicit public-column allowlist: no account, password, token or session tables are exported.
  const surahs=db.prepare('SELECT id,name_en,name_ar,meaning,ayah_count,revelation_type,juz FROM surahs ORDER BY id').all();
  const reciters=db.prepare('SELECT id,name,name_ar,slug,country,style,image_url FROM reciters ORDER BY id').all().map(describeReciter);
  const tracks=db.prepare('SELECT id,title,artist,type,language,mood,cover_url,audio_url,link_url,duration,plays FROM tracks ORDER BY id').all();
  return validateCatalogue({version:1,surahs,reciters,tracks});
 }finally{db.close();}
}

async function fetchEdition(identifier){
 let lastError;
 for(let attempt=0;attempt<4;attempt++){
  try{
   const response=await fetch('https://api.alquran.cloud/v1/quran/'+identifier,{signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw new Error('Quran source returned HTTP '+response.status);
   const result=await response.json();
   if(result.code!==200||result.data?.edition?.identifier!==identifier||result.data?.surahs?.length!==114)throw new Error('Incomplete Quran edition: '+identifier);
   return result.data;
  }catch(error){lastError=error;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}
 }
 throw lastError;
}

function buildChapters(catalogue,arabic,english){
 let globalNumber=0;
 const chapters=catalogue.surahs.map((surah,index)=>{
  const a=arabic.surahs[index],e=english.surahs[index];
  if(a.number!==surah.id||e.number!==surah.id||a.ayahs.length!==surah.ayah_count||e.ayahs.length!==surah.ayah_count)throw new Error('Chapter mapping or verse count mismatch: '+surah.id);
  const ayahs=a.ayahs.map((verse,i)=>{
   const translation=e.ayahs[i];globalNumber++;
   if(verse.numberInSurah!==i+1||translation.numberInSurah!==i+1||verse.number!==globalNumber||translation.number!==globalNumber||!verse.text?.trim()||!translation.text?.trim())throw new Error('Verse mapping mismatch: '+surah.id+':'+(i+1));
   return {number:i+1,global_number:globalNumber,arabic:verse.text,english:translation.text};
  });
  return {surah_id:surah.id,ayahs,source:'AlQuran Cloud',arabic_edition:'quran-uthmani',translation:'Sahih International',translation_edition:'en.sahih'};
 });
 if(globalNumber!==6236)throw new Error('Expected 6,236 verses; found '+globalNumber);
 return chapters;
}

async function run(args=process.argv.slice(2)){
 if(args.includes('--help')){console.log('node scripts/export-static-data.cjs [--from-sqlite] [--refresh-quran]\n--from-sqlite imports the existing public catalogue with its IDs and media.\n--refresh-quran downloads and validates Arabic Uthmani and Sahih International text.\nWithout options, validates existing static assets. No Firebase user data is read.');return;}
 if(args.some(a=>!['--from-sqlite','--refresh-quran'].includes(a)))throw new Error('Unknown option. Use --help.');
 const catalogue=args.includes('--from-sqlite')?readSqlite():validateCatalogue(JSON.parse(fs.readFileSync(catalogueFile,'utf8')));
 let chapters;
 if(args.includes('--refresh-quran')){
  const [arabic,english]=await Promise.all([fetchEdition('quran-uthmani'),fetchEdition('en.sahih')]);
  chapters=buildChapters(catalogue,arabic,english);
 }else{
  chapters=catalogue.surahs.map(s=>JSON.parse(fs.readFileSync(path.join(output,'quran',s.id+'.json'),'utf8')));
  let globalNumber=0;
  for(const [index,chapter] of chapters.entries()){
   if(chapter.surah_id!==index+1||chapter.ayahs.length!==catalogue.surahs[index].ayah_count)throw new Error('Invalid static chapter: '+(index+1));
   for(const [i,ayah] of chapter.ayahs.entries())if(ayah.number!==i+1||ayah.global_number!==++globalNumber||!ayah.arabic?.trim()||!ayah.english?.trim())throw new Error('Invalid static verse: '+chapter.surah_id+':'+(i+1));
  }
  if(globalNumber!==6236)throw new Error('Incomplete static Quran text.');
 }
 fs.mkdirSync(path.join(output,'quran'),{recursive:true});
 if(args.includes('--from-sqlite'))fs.writeFileSync(catalogueFile,JSON.stringify(catalogue,null,2)+'\n');
 if(args.includes('--refresh-quran')){
  const files=[];
  for(const chapter of chapters){const content=JSON.stringify(chapter)+'\n';fs.writeFileSync(path.join(output,'quran',chapter.surah_id+'.json'),content);files.push({surah_id:chapter.surah_id,ayah_count:chapter.ayahs.length,sha256:crypto.createHash('sha256').update(content).digest('hex')});}
  fs.writeFileSync(path.join(output,'quran','manifest.json'),JSON.stringify({source:'https://api.alquran.cloud',arabic_edition:'quran-uthmani',translation_edition:'en.sahih',downloaded_at:new Date().toISOString(),surahs:114,ayahs:6236,files},null,2)+'\n');
 }
 console.log('Static catalogue: '+catalogue.surahs.length+' surahs, '+catalogue.reciters.length+' reciters, '+catalogue.tracks.length+' recordings. Quran text: 114 chapters, 6,236 Arabic/English verse pairs.');
}

module.exports={validateCatalogue,buildChapters,readSqlite,run};
if(require.main===module)run().catch(error=>{console.error(error.message);process.exitCode=1});
