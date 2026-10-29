const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createItemParser,loadItemParser}=require('../server/utils/static-items');
const root=path.resolve(__dirname,'..'),testRoot=path.join(root,'work','static-migration-tests');
fs.mkdirSync(testRoot,{recursive:true});
const directory=fs.mkdtempSync(path.join(testRoot,'run-'));
after(()=>{if(path.dirname(path.resolve(directory))===path.resolve(testRoot)&&path.basename(directory).startsWith('run-'))fs.rmSync(directory,{recursive:true,force:true});});

test('migration recognizes custom static recordings with their original IDs and leaves its catalogue untouched',()=>{
 const file=path.join(directory,'catalogue.json');
 const fixture={surahs:[{id:1},{id:18}],reciters:[{id:3},{id:1}],tracks:[{id:1},{id:987654,title:'My permitted recording',audio_url:'/media/custom.mp3'}]};
 fs.writeFileSync(file,JSON.stringify(fixture));
 const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before=hash();
 const parseItem=loadItemParser(file);
 assert.deepEqual(parseItem({item_type:'track',item_id:987654,reciter_id:3}),{item_type:'track',item_id:987654,reciter_id:null});
 assert.deepEqual(parseItem({item_type:'surah',item_id:'18'}),{item_type:'surah',item_id:18,reciter_id:1});
 assert.deepEqual(parseItem({item_type:'surah',item_id:1,reciter_id:'3'}),{item_type:'surah',item_id:1,reciter_id:3});
 assert.equal(hash(),before);
});

test('migration reloads the active static catalogue rather than caching stale track IDs',()=>{
 const file=path.join(directory,'updated-catalogue.json');
 const fixture={surahs:[{id:1}],reciters:[{id:1}],tracks:[{id:1}]};
 fs.writeFileSync(file,JSON.stringify(fixture));
 assert.deepEqual(loadItemParser(file)({item_type:'track',item_id:7000}),{error:'Track not found'});
 fixture.tracks.push({id:7000});fs.writeFileSync(file,JSON.stringify(fixture));
 assert.deepEqual(loadItemParser(file)({item_type:'track',item_id:7000}),{item_type:'track',item_id:7000,reciter_id:null});
});

test('migration preserves previous validation for invalid and missing item/reciter references',()=>{
 const parseItem=createItemParser({surahs:[{id:1}],reciters:[{id:1}],tracks:[{id:120}]});
 for(const input of [null,{}, {item_type:'episode',item_id:1},{item_type:'track',item_id:0},{item_type:'track',item_id:1.5}])assert.match(parseItem(input).error,/item_type must/);
 assert.deepEqual(parseItem({item_type:'surah',item_id:114}),{error:'Surah not found'});
 assert.deepEqual(parseItem({item_type:'surah',item_id:1,reciter_id:-1}),{error:'Invalid reciter id'});
 assert.deepEqual(parseItem({item_type:'surah',item_id:1,reciter_id:9}),{error:'Reciter not found'});
 assert.deepEqual(parseItem({item_type:'track',item_id:119}),{error:'Track not found'});
 assert.throws(()=>createItemParser({surahs:[{id:1},{id:1}],reciters:[],tracks:[]}),/duplicate surahs IDs/);
});

test('the default migration parser resolves every current public catalogue reference',()=>{
 const catalogue=JSON.parse(fs.readFileSync(path.join(root,'public/data/catalogue.json'),'utf8')),parseItem=loadItemParser();
 for(const track of catalogue.tracks)assert.deepEqual(parseItem({item_type:'track',item_id:track.id}),{item_type:'track',item_id:track.id,reciter_id:null});
 for(const reciter of catalogue.reciters)for(const surah of catalogue.surahs)assert.deepEqual(parseItem({item_type:'surah',item_id:surah.id,reciter_id:reciter.id}),{item_type:'surah',item_id:surah.id,reciter_id:reciter.id});
});
