if(!process.env.FIREBASE_AUTH_EMULATOR_HOST||!process.env.FIREBASE_DATABASE_EMULATOR_HOST)throw new Error('API tests require Firebase emulators. Run npm test.');
const runId=Date.now();
process.env.FIREBASE_PROJECT_ID='demo-hidayah-fm';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const work=path.resolve(__dirname,'../work');
fs.mkdirSync(work,{recursive:true});
const dir=fs.mkdtempSync(path.join(work,'hidayah-api-test-'));
process.env.DATA_DIR=dir;
const app=require('../server/index');
const db=require('../server/db');
let server,base,alice,bob;
async function request(url,method='GET',body,token){
 if(token===undefined&&/^\/(surahs|tracks|reciters)(?:[/?]|$)/.test(url))token=alice?.token;
 const headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;
 const response=await fetch(base+'/api'+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 return {status:response.status,body:await response.json()};
}
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 alice=(await request('/auth/signup','POST',{name:'Alice Tester',email:`alice-${runId}@example.test`,password:'original-password'})).body;
 bob=(await request('/auth/signup','POST',{name:'Bob Tester',email:`bob-${runId}@example.test`,password:'original-password'})).body;
});
after(async()=>{await new Promise(r=>server.close(r));db.close();if(path.dirname(dir)===work&&path.basename(dir).startsWith('hidayah-api-test-'))fs.rmSync(dir,{recursive:true,force:true});});
test('catalogue starts fully seeded and root serves the application',async()=>{
 const health=await request('/health');assert.equal(health.status,200);
 const {body}=await request('/surahs');assert.equal(body.surahs.length,114);assert.equal(body.surahs.reduce((n,s)=>n+s.ayah_count,0),6236);
 assert.equal((await request('/reciters')).body.reciters.filter(r=>r.audio_available).length,6);
 assert.match((await request('/surahs?reciter=3')).body.surahs[0].audio_url,/server12\.mp3quran\.net/);
 assert.match((await request('/surahs?reciter=4')).body.surahs[0].audio_url,/complete\/001.mp3/);
 assert.equal((await request('/surahs?reciter=7')).body.surahs[0].audio_url,null);
 assert.ok((await request('/tracks')).body.tracks.every(t=>t.link_url));
 assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/account.html')).status,200);assert.equal((await fetch(base+'/missing-page')).status,404);
});
test('authentication validates input and protects personal data',async()=>{
 assert.equal((await request('/playlists')).status,401);
 assert.equal((await request('/auth/signup','POST',{name:{bad:true},email:[],password:42})).status,400);
 assert.equal((await request('/auth/signup','POST',{name:'Someone',email:`alice-${runId}@example.test`,password:'12345678'})).status,409);
 assert.equal((await request('/auth/login','POST',{email:`alice-${runId}@example.test`,password:'wrong-password'})).status,401);
 assert.equal((await request('/auth/login','POST',{email:` ALICE-${runId}@EXAMPLE.TEST `,password:'original-password'})).status,200);
 const me=await request('/auth/me','GET',undefined,alice.token);assert.equal(me.body.user.name,'Alice Tester');assert.equal(me.body.user.password_hash,undefined);
 assert.equal((await request('/auth/me','PATCH',{name:[]},alice.token)).status,400);
 assert.equal((await request('/auth/me','PATCH',{name:'Updated Name'},alice.token)).body.user.name,'Updated Name');
});
test('playlist CRUD, ownership, duplicate prevention and complete ordering',async()=>{
 assert.equal((await request('/playlists','POST',{name:25},alice.token)).status,400);
 const p=(await request('/playlists','POST',{name:'Evening peace'},alice.token)).body;
 assert.equal((await request('/playlists/'+p.id,'GET',undefined,bob.token)).status,404);
 assert.equal((await request('/playlists/'+p.id,'DELETE',undefined,bob.token)).status,404);
 const item={item_type:'surah',item_id:1,reciter_id:1};
 assert.equal((await request('/playlists/'+p.id+'/items','POST',item,alice.token)).status,201);
 assert.equal((await request('/playlists/'+p.id+'/items','POST',item,alice.token)).status,409);
 await request('/playlists/'+p.id+'/items','POST',{item_type:'track',item_id:1},alice.token);
 assert.equal((await request('/playlists/'+p.id+'/items','POST',{item_type:'track',item_id:1},alice.token)).status,409);
 let data=(await request('/playlists/'+p.id,'GET',undefined,alice.token)).body;assert.equal(data.items.length,2);
 assert.equal((await request('/playlists/'+p.id+'/order','PUT',{entry_ids:[data.items[0].entry_id,data.items[0].entry_id]},alice.token)).status,400);
 const order=data.items.map(i=>i.entry_id).reverse();assert.equal((await request('/playlists/'+p.id+'/order','PUT',{entry_ids:order},alice.token)).status,200);
 data=(await request('/playlists/'+p.id,'GET',undefined,alice.token)).body;assert.deepEqual(data.items.map(i=>i.entry_id),order);
 await request('/playlists/'+p.id,'PATCH',{name:'Renamed'},alice.token);assert.equal((await request('/playlists/'+p.id,'GET',undefined,alice.token)).body.name,'Renamed');
 await request('/playlists/'+p.id+'/items/'+order[0],'DELETE',undefined,alice.token);assert.equal((await request('/playlists/'+p.id,'GET',undefined,alice.token)).body.items.length,1);
 await request('/playlists/'+p.id,'DELETE',undefined,alice.token);assert.equal((await request('/playlists/'+p.id,'GET',undefined,alice.token)).status,404);
});
test('likes toggle correctly for tracks with a null reciter',async()=>{
 const item={item_type:'track',item_id:1};assert.equal((await request('/likes/toggle','POST',item,alice.token)).body.liked,true);
 assert.equal((await request('/likes/toggle','POST',item,alice.token)).body.liked,false);
 assert.equal((await request('/likes','GET',undefined,alice.token)).body.likes.length,0);
 assert.equal((await request('/likes/toggle','POST',{item_type:'surah',item_id:999},alice.token)).status,400);
 assert.equal((await request('/likes/toggle','POST',{item_type:'surah',item_id:1,reciter_id:'bad'},alice.token)).status,400);
});
test('history stores progress, counts completed chapters once, and can be cleared',async()=>{
 const item={item_type:'surah',item_id:1,reciter_id:1};await request('/history','POST',item,alice.token);await request('/history','POST',item,alice.token);
 assert.equal((await request('/history?limit=50','GET',undefined,alice.token)).body.history.length,1);
 assert.equal((await request('/history/progress','POST',{...item,seconds:100,duration:50},alice.token)).status,400);
 await request('/history/progress','POST',{...item,seconds:50,duration:50,completed:true},alice.token);
 await request('/history/progress','POST',{...item,seconds:2,duration:50,completed:false},alice.token);
 assert.equal((await request('/history/stats','GET',undefined,alice.token)).body.completed_surahs,1);
 await request('/history','DELETE',undefined,alice.token);assert.equal((await request('/history/stats','GET',undefined,alice.token)).body.completed_surahs,0);
});
test('search handles chapter numbers and limits cannot be bypassed with negative values',async()=>{
 assert.equal((await request('/tracks/search?q=114')).body.surahs[0].id,114);
 assert.equal((await request('/surahs?q=1')).body.surahs[0].id,1);
 assert.equal((await request('/tracks?limit=-1')).body.tracks.length,1);
 assert.equal((await request('/tracks?q=x&q=y')).status,400);
 assert.equal((await request('/surahs/999')).status,400);
});
test('preferences persist and exports omit password hashes and tokens',async()=>{
 const settings={city:'London',country:'United Kingdom',method:3,reciter_id:3,translation:true};
 assert.equal((await request('/auth/settings','PUT',settings,alice.token)).status,200);
 assert.deepEqual((await request('/auth/settings','GET',undefined,alice.token)).body.settings,settings);
 assert.equal((await request('/auth/settings','PUT',{...settings,reciter_id:999},alice.token)).status,400);
 const exp=await request('/auth/export','GET',undefined,alice.token);assert.equal(exp.status,200);assert.ok(exp.body.playlists);assert.deepEqual(exp.body.settings,settings);assert.ok(!JSON.stringify(exp.body).includes('password_hash'));assert.equal(exp.body.token,undefined);
});
test('password changes revoke old tokens and account deletion removes owned data',async()=>{
 assert.equal((await request('/auth/change-password','POST',{current_password:'wrong',new_password:'updated-password'},bob.token)).status,403);
 const changed=await request('/auth/change-password','POST',{current_password:'original-password',new_password:'updated-password'},bob.token);assert.equal(changed.status,200);
 assert.equal((await request('/auth/me','GET',undefined,bob.token)).status,401);
 assert.equal((await request('/auth/me','GET',undefined,changed.body.token)).status,200);
 assert.equal((await request('/auth/me','DELETE',{password:'wrong'},changed.body.token)).status,403);
 assert.equal((await request('/auth/me','DELETE',{password:'updated-password'},changed.body.token)).status,200);
 assert.equal((await request('/auth/me','GET',undefined,changed.body.token)).status,401);
 assert.equal((await request('/playlists','GET',undefined,changed.body.token)).status,401);
});

test('every catalogue and private API rejects a signed-out visitor',async()=>{
 for(const url of ['/surahs','/tracks','/reciters','/home','/prayer','/auth/state','/auth/export'])assert.equal((await request(url,'GET',undefined,null)).status,401,url);
});
test('Firebase refresh returns a valid renewed session',async()=>{
 const result=await request('/auth/refresh','POST',{refreshToken:alice.refreshToken});assert.equal(result.status,200);assert.equal(result.body.user.id,alice.user.id);alice=result.body;
});
test('reading bookmark and playback state are stored with the Firebase account',async()=>{
 assert.equal((await request('/auth/bookmark','PUT',{surah:1,ayah:3},alice.token)).status,200);
 assert.equal((await request('/auth/bookmark','PUT',{surah:1,ayah:8},alice.token)).status,400);
 const item={type:'surah',id:1,reciter_id:1};
 assert.equal((await request('/auth/playback','PUT',{item,queue:[item],time:12,repeat:'all',shuffle:true},alice.token)).status,200);
 const saved=(await request('/auth/state','GET',undefined,alice.token)).body;assert.equal(saved.bookmark.ayah,3);assert.equal(saved.playback.time,12);assert(saved.playback.item.audio_url.startsWith('https:'));
});
test('parallel Firebase updates preserve unrelated user fields',async()=>{
 const [p,l]=await Promise.all([request('/playlists','POST',{name:'Parallel save'},alice.token),request('/likes/toggle','POST',{item_type:'surah',item_id:114,reciter_id:1},alice.token)]);
 assert.equal(p.status,201);assert.equal(l.status,201);const data=(await request('/auth/export','GET',undefined,alice.token)).body;
 assert(data.playlists.some(x=>x.id===p.body.id));assert(data.likes.some(x=>x.item_id===114));assert.equal(data.bookmark.ayah,3);
});
test('Firebase rules block anonymous and different-account access directly',async()=>{
 const other=(await request('/auth/signup','POST',{name:'Rules Tester',email:`rules-${runId}@example.test`,password:'rules-password'})).body;
 const url=`http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/users/${alice.user.id}.json?ns=demo-hidayah-fm-default-rtdb`;
 assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url+'&auth='+other.token)).status,401);
 assert.equal((await fetch(url+'&auth='+other.token,{method:'PUT',body:JSON.stringify({profile:other.user})})).status,401);
 assert.equal((await fetch(url+'&auth='+alice.token)).status,200);
 assert.equal((await request('/auth/me','DELETE',{password:'rules-password'},other.token)).status,200);
});
test('Firebase password recovery validates email and creates an emulator reset action',async()=>{
 assert.equal((await request('/auth/reset-password','POST',{email:'invalid'})).status,400);
 const result=await request('/auth/reset-password','POST',{email:alice.user.email});assert.equal(result.status,200);
 const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/demo-hidayah-fm/oobCodes`);
 assert((await response.json()).oobCodes.some(code=>code.email===alice.user.email));
});
test('legacy library import is authenticated, idempotent and leaves its source unchanged',async()=>{
 const Database=require('better-sqlite3'),bcrypt=require('bcryptjs'),crypto=require('node:crypto');
 const file=path.join(dir,'legacy-source.db'),legacy=new Database(file);
 legacy.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,email TEXT,password_hash TEXT,created_at TEXT);CREATE TABLE playlists(id INTEGER PRIMARY KEY,user_id INTEGER,name TEXT,color TEXT,created_at TEXT);CREATE TABLE playlist_items(id INTEGER PRIMARY KEY,playlist_id INTEGER,item_type TEXT,item_id INTEGER,reciter_id INTEGER,position INTEGER,added_at TEXT);CREATE TABLE likes(id INTEGER PRIMARY KEY,user_id INTEGER,item_type TEXT,item_id INTEGER,reciter_id INTEGER,created_at TEXT);CREATE TABLE history(id INTEGER PRIMARY KEY,user_id INTEGER,item_type TEXT,item_id INTEGER,reciter_id INTEGER,played_at TEXT);`);
 legacy.prepare('INSERT INTO users VALUES(1,?,?,?,?)').run('Old Listener',alice.user.email,await bcrypt.hash('old-local-password',4),'2026-01-01 10:00:00');
 legacy.exec("INSERT INTO playlists VALUES(1,1,'Old local playlist','#1db98a','2026-01-01 10:00:00');INSERT INTO playlist_items VALUES(1,1,'surah',1,1,0,'2026-01-01 10:00:00');INSERT INTO history VALUES(1,1,'surah',1,1,'2026-01-01 10:00:00')");legacy.close();
 const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before=hash();
 const migrate=require('../server/migrate-legacy');
 await assert.rejects(migrate({file,email:alice.user.email,legacyPassword:'incorrect',firebasePassword:'original-password'}),/old local email or password/);
 const options={file,email:alice.user.email,legacyPassword:'old-local-password',firebasePassword:'original-password'};
 assert.equal((await migrate(options)).playlists,1);assert.equal((await migrate(options)).alreadyImported,true);assert.equal(hash(),before);
 const exported=(await request('/auth/export','GET',undefined,alice.token)).body;
 assert.equal(exported.playlists.filter(p=>p.name==='Old local playlist').length,1);assert.equal(exported.playlists.find(p=>p.name==='Old local playlist').items.length,1);
});
