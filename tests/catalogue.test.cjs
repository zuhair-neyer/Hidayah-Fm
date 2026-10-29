const {test, after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const Database=require('better-sqlite3');
const catalogue=require('../server/catalogue.json');
const root=path.resolve(__dirname,'..');
const testRoot=path.join(root,'work','catalogue-tests');
fs.mkdirSync(testRoot,{recursive:true});
const directory=fs.mkdtempSync(path.join(testRoot,'run-'));

function seed(folder){
 const result=spawnSync(process.execPath,['server/seed.js'],{cwd:root,encoding:'utf8',env:{...process.env,DATA_DIR:folder}});
 assert.equal(result.status,0,result.stderr||result.stdout);
}
function open(folder){return new Database(path.join(folder,'hidayah-catalogue.db'));}
const identity=track=>[track.type,track.artist.toLowerCase(),track.title.toLowerCase()].join('|');

after(()=>{
 const resolved=path.resolve(directory);
 if(path.dirname(resolved)===path.resolve(testRoot)&&path.basename(resolved).startsWith('run-'))fs.rmSync(resolved,{recursive:true,force:true});
});

test('catalogue contains 60 entries per collection and source evidence for every addition',()=>{
 assert.equal(catalogue.length,120);
 for(const type of ['nasheed','naat'])assert.equal(catalogue.filter(t=>t.type===type).length,60);
 assert.equal(new Set(catalogue.map(identity)).size,120);
 assert.equal(new Set(catalogue.filter(t=>t.videoId).map(t=>t.videoId)).size,118);
 for(const track of catalogue.slice(12)){
  assert.match(track.videoId,/^[A-Za-z0-9_-]{11}$/);
  assert.equal(track.source.status,200);
  assert.match(track.source.channelUrl,/^https:\/\/www\.youtube\.com\//);
  assert.ok(track.source.title&&track.title&&track.artist&&track.language);
 }
});

test('fresh seeding retains legacy IDs and is idempotent',()=>{
 const folder=path.join(directory,'fresh');
 seed(folder);
 let db=open(folder);
 const first=db.prepare('SELECT * FROM tracks ORDER BY id').all();
 assert.equal(first.length,120);
 assert.deepEqual(first.slice(0,12).map(t=>[t.id,identity(t)]),catalogue.slice(0,12).map((t,i)=>[i+1,identity(t)]));
 db.close();
 seed(folder);
 db=open(folder);
 assert.deepEqual(db.prepare('SELECT * FROM tracks ORDER BY id').all(),first);
 db.close();
});

test('upgrading a populated catalogue preserves IDs, custom media and custom entries',()=>{
 const folder=path.join(directory,'upgrade');
 seed(folder);
 let db=open(folder);
 db.prepare('DELETE FROM tracks WHERE id > 12').run();
 const search='https://www.youtube.com/results?search_query='+encodeURIComponent('Owais Raza Qadri Faslon Ko Takalluf');
 db.prepare('UPDATE tracks SET link_url = ? WHERE id = 8').run(search);
 db.prepare("UPDATE tracks SET audio_url='/media/recording.mp3',link_url='https://example.com/my-recording',cover_url='/media/artwork.png',duration=234,plays=17,mood='Personal favourite' WHERE id=1").run();
 db.prepare("INSERT INTO tracks(id,title,artist,type,language,mood,audio_url,link_url,plays) VALUES(500,'My recording','My artist','naat','Urdu','Custom','/media/mine.mp3','https://example.com/mine',42)").run();
 const original=db.prepare('SELECT * FROM tracks ORDER BY id').all();
 db.close();
 seed(folder);
 db=open(folder);
 const updated=db.prepare('SELECT * FROM tracks ORDER BY id').all();
 assert.equal(updated.length,121);
 for(const track of original){
  const expected=track.id===8?{...track,link_url:'https://www.youtube.com/watch?v=dMH4Rpcvevc'}:track;
  assert.deepEqual(updated.find(t=>t.id===track.id),expected);
 }
 db.close();
 seed(folder);
 db=open(folder);
 assert.deepEqual(db.prepare('SELECT * FROM tracks ORDER BY id').all(),updated);
 db.close();
});

test('track listing exposes the full catalogue and filters later additions',()=>{
 const folder=path.join(directory,'api');
 process.env.DATA_DIR=folder;
 require('../server/seed');
 const db=require('../server/db');
 const controller=require('../server/controllers/tracks.controller');
 const list=query=>{let result;controller.list({query},{json:value=>{result=value}});return result.tracks;};
 try{
  assert.equal(list({}).length,120);
  assert.equal(list({limit:'200'}).length,120);
  for(const type of ['nasheed','naat'])assert.equal(list({type}).length,60);
  assert.equal(list({limit:'-1'}).length,1);
  assert.equal(list({limit:'1'}).length,1);
  const last=catalogue.at(-1);
  assert.ok(list({q:last.title,type:last.type}).some(t=>identity(t)===identity(last)));
 }finally{db.close();}
});
