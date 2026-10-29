// Browser-side services preserve the UI's existing API-shaped interface.
// No requests are sent to /api and no application server is required.
import * as firebase from './firebase-service.js';
import * as catalogue from './catalogue.js';

const str=value=>typeof value==='string'?value:'';
const validPass=value=>typeof value==='string'&&value.length>=8&&value.length<=128;
const now=()=>new Date().toISOString();
const methods=[1,2,3,4,5,7,8,9,10,11,12,13,14,15,16];
const sortedItems=p=>Object.values(p.items||{}).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
const summary=p=>({id:p.id,name:p.name,color:p.color,created_at:p.created_at,item_count:Object.keys(p.items||{}).length});
function own(record,id){const p=Object.hasOwn(record.playlists||{},id)&&record.playlists[id];if(!p)throw firebase.error('Playlist not found',404);return p;}
function cleanName(value){const name=str(value).trim();if(!name||name.length>60)throw firebase.error('Playlist name required (max 60 characters)');return name;}
const cleanColor=(value,fallback='#1db98a')=>typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value)?value:fallback;
function credentials(body){
  const email=str(body.email).trim().toLowerCase(),password=str(body.password);
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!password||password.length>128)throw firebase.error('Enter a valid email address and password.');
  return {email,password,returnSecureToken:true};
}
function parseItem(body){const item=catalogue.parseItem(body);if(item.error)throw firebase.error(item.error);return item;}
function resetCode(body){const code=str(body.oobCode);if(!code||code.length>2048||/\s/.test(code))throw firebase.error('Open the complete password reset link from your email.');return code;}
async function verifyResetCode(oobCode){
  const result=await firebase.authRequest('resetPassword',{oobCode});
  if(result.requestType!=='PASSWORD_RESET'||!result.email)throw firebase.error('This link is not a password reset link. Please request a new one.');
  return result;
}
async function nextSecond(){await new Promise(resolve=>setTimeout(resolve,1000-Date.now()%1000+30));}
async function reauthenticate(user,password){
  try{return await firebase.authRequest('signInWithPassword',{email:user.email,password:str(password),returnSecureToken:true});}
  catch(error){if(error.status===401)throw firebase.error('Current password is incorrect.',403);throw error;}
}
function playbackItem(item){
  if(!item||typeof item!=='object')throw firebase.error('Invalid playback item.');
  const parsed=parseItem({item_type:item.type,item_id:item.id,reciter_id:item.reciter_id}),result=catalogue.enrich(parsed);
  if(!result?.audio_url)throw firebase.error('Choose an audio recording.');
  delete result.entry_id;return result;
}
function exportData(record){return {exported_at:now(),user:record.profile,settings:record.settings||{},playlists:Object.values(record.playlists||{}).map(p=>({...p,items:sortedItems(p)})),likes:Object.values(record.likes||{}),history:Object.values(record.history||{}),progress:Object.values(record.progress||{}),bookmark:record.bookmark||null,playback:record.playback||null};}

export async function dispatch(raw,method='GET',body={},token=null){
  const url=new URL(raw,'https://hidayah.invalid'),path=url.pathname,params=url.searchParams;
  body??={};
  if(typeof body!=='object'||Array.isArray(body))throw firebase.error('Send a JSON object.');
  if(method==='POST'&&(path==='/auth/signup'||path==='/auth/login')){
    const input=credentials(body),signup=path.endsWith('/signup'),name=str(body.name).trim();
    if(signup&&(name.length<2||name.length>60))throw firebase.error('Name must contain 2–60 characters.');
    if(signup&&!validPass(body.password))throw firebase.error('Use 8–128 characters for your password.');
    await firebase.assertPrivateDatabase();
    let result=await firebase.authRequest(signup?'signUp':'signInWithPassword',input);
    if(signup)result={...result,...await firebase.authRequest('update',{idToken:result.idToken,displayName:name,returnSecureToken:true})};
    const identity=await firebase.identity(result.idToken);
    if(signup)identity.name=name;
    return firebase.sessionData(result,await firebase.ensureUser(identity,result.idToken));
  }
  if(method==='POST'&&path==='/auth/refresh'){
    if(!str(body.refreshToken)||body.refreshToken.length>10000)throw firebase.error('Please sign in again.',401);
    const result=await firebase.refresh(body.refreshToken),identity=await firebase.identity(result.idToken),record=(await firebase.read(identity.id,result.idToken)).value;
    if(!record?.profile)throw firebase.error('Please sign in again.',401);
    return firebase.sessionData(result,record.profile);
  }
  if(method==='POST'&&path==='/auth/reset-password'){
    const email=str(body.email).trim().toLowerCase();
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw firebase.error('Enter a valid email address.');
    try{await firebase.authRequest('sendOobCode',{requestType:'PASSWORD_RESET',email});}catch(error){if(error.status!==401)throw error;}
    return {ok:true,message:'If an account uses this email, a password reset link will arrive shortly. Check your inbox and spam folder.'};
  }
  if(method==='POST'&&path==='/auth/reset-password/verify')return {email:(await verifyResetCode(resetCode(body))).email};
  if(method==='POST'&&path==='/auth/reset-password/confirm'){
    const oobCode=resetCode(body);if(!validPass(body.new_password))throw firebase.error('Use 8–128 characters for your new password.');
    const verified=await verifyResetCode(oobCode);await nextSecond();
    await firebase.authRequest('resetPassword',{oobCode,newPassword:body.new_password});
    // Record the new auth_time in RTDB as well. This blocks older ID tokens at
    // the database rules layer, where browser-side checks cannot be bypassed.
    try{
      const fresh=await firebase.authRequest('signInWithPassword',{email:verified.email,password:body.new_password,returnSecureToken:true});
      const identity=await firebase.identity(fresh.idToken);
      const record=(await firebase.read(identity.id,fresh.idToken)).value;
      if(record?.profile)await firebase.transaction(identity.id,fresh.idToken,data=>{data.auth_valid_after=identity.auth_time;});
    }catch{
      return {ok:true,message:'Your password has been updated. Sign in with your new password to finish syncing your account security.'};
    }
    return {ok:true,message:'Your password has been updated. Sign in with your new password.'};
  }

  if(!token)throw firebase.error('Please sign in to continue.',401);
  await catalogue.loadCatalogue();
  // Static catalogue assets are public files; the application's sign-in gate
  // stays in place. Private records are always authorized by Firebase rules.
  if(method==='GET'){
    if(path==='/surahs')return catalogue.listSurahs(params);
    const ayahs=path.match(/^\/surahs\/(\d+)\/ayahs$/);if(ayahs)return catalogue.getAyahs(Number(ayahs[1]));
    const surah=path.match(/^\/surahs\/(\d+)$/);if(surah)return catalogue.getSurah(Number(surah[1]),params);
    if(path==='/reciters')return catalogue.listReciters();
    const reciter=path.match(/^\/reciters\/([^/]+)$/);if(reciter)return catalogue.getReciter(reciter[1]);
    if(path==='/tracks/search')return catalogue.search(params.get('q')||'');
    if(path==='/tracks')return catalogue.listTracks(params);
    const track=path.match(/^\/tracks\/(\d+)$/);if(track)return catalogue.getTrack(Number(track[1]));
    if(path==='/prayer')return prayer(params);
  }
  const identity=await firebase.identity(token),record=(await firebase.read(identity.id,token)).value;
  if(!record?.profile)throw firebase.error('Sign in to finish setting up your account.',401);
  const user=record.profile,change=update=>firebase.transaction(identity.id,token,update);
  if(path==='/auth/me'){
    if(method==='GET')return {user};
    if(method==='PATCH'){
      const name=str(body.name).trim();if(name.length<2||name.length>60)throw firebase.error('Name must contain 2–60 characters.');
      await firebase.authRequest('update',{idToken:token,displayName:name});
      return {user:await change(data=>{data.profile.name=name;return data.profile;})};
    }
    if(method==='DELETE'){
      const verified=await reauthenticate(user,body.password),snapshot=(await firebase.read(user.id,verified.idToken)).value;
      await firebase.remove(user.id,verified.idToken);
      try{await firebase.authRequest('delete',{idToken:verified.idToken});}
      catch(error){try{await firebase.identity(verified.idToken);await firebase.transaction(user.id,verified.idToken,data=>Object.assign(data,snapshot));}catch{}throw error;}
      return {ok:true};
    }
  }
  if(path==='/auth/change-password'&&method==='POST'){
    if(!validPass(body.new_password))throw firebase.error('Use 8–128 characters for your new password.');
    if(body.new_password===body.current_password)throw firebase.error('Choose a different new password.');
    const verified=await reauthenticate(user,body.current_password);await nextSecond();
    await firebase.authRequest('update',{idToken:verified.idToken,password:body.new_password,returnSecureToken:true});
    const result=await firebase.authRequest('signInWithPassword',{email:user.email,password:body.new_password,returnSecureToken:true}),fresh=await firebase.identity(result.idToken);
    await firebase.transaction(user.id,result.idToken,data=>{data.auth_valid_after=fresh.auth_time;});
    return firebase.sessionData(result,user);
  }
  if(path==='/auth/settings'){
    if(method==='GET')return {settings:record.settings||{}};
    if(method==='PUT'){
      const {city,country,method:calculation,reciter_id,translation}=body;
      if(typeof city!=='string'||city.length>100||typeof country!=='string'||country.length>100||Boolean(city.trim())!==Boolean(country.trim())||!methods.includes(calculation)||!Number.isInteger(reciter_id)||!catalogue.listReciters().reciters.some(r=>r.id===reciter_id)||typeof translation!=='boolean')throw firebase.error('Check your location, calculation method, and reciter.');
      const settings={city:city.trim(),country:country.trim(),method:calculation,reciter_id,translation};await change(data=>{data.settings=settings;});return {settings};
    }
  }
  if(path==='/auth/state'&&method==='GET')return {bookmark:record.bookmark||null,playback:record.playback||null};
  if(path==='/auth/bookmark'&&method==='PUT'){
    const {surah,ayah}=body,chapter=Number.isInteger(surah)&&catalogue.listSurahs().surahs.find(s=>s.id===surah);
    if(!chapter||!Number.isInteger(ayah)||ayah<1||ayah>chapter.ayah_count)throw firebase.error('Choose a valid verse.');
    const bookmark={surah,ayah,name:chapter.name_en};await change(data=>{data.bookmark=bookmark;});return {bookmark};
  }
  if(path==='/auth/playback'&&method==='PUT'){
    if(typeof body.time!=='number'||!Number.isFinite(body.time)||body.time<0||body.time>86400||!Array.isArray(body.queue)||body.queue.length>500||!['off','all','one'].includes(body.repeat)||typeof body.shuffle!=='boolean')throw firebase.error('Invalid playback state.');
    const playback={item:playbackItem(body.item),queue:body.queue.map(playbackItem),time:body.time,shuffle:body.shuffle,repeat:body.repeat,updated_at:now()};
    await change(data=>{data.playback=playback;});return {ok:true};
  }
  if(path==='/auth/export'&&method==='GET')return exportData(record);
  if(path==='/playlists'){
    if(method==='GET')return {playlists:Object.values(record.playlists||{}).sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(summary)};
    if(method==='POST'){
      const p={id:crypto.randomUUID(),name:cleanName(body.name),color:cleanColor(body.color),created_at:now()};
      await change(data=>{data.playlists||={};data.playlists[p.id]=p;});return summary(p);
    }
  }
  const playlist=path.match(/^\/playlists\/([^/]+)(?:\/(items|order)(?:\/([^/]+))?)?$/);
  if(playlist){
    const [,id,action,entryId]=playlist;
    if(!action&&method==='GET'){const p=own(record,id);return {...summary(p),items:sortedItems(p).map(catalogue.enrich).filter(Boolean)};}
    if(!action&&method==='PATCH')return change(data=>{const p=own(data,id);if(body.name!==undefined)p.name=cleanName(body.name);p.color=cleanColor(body.color,p.color);return summary(p);});
    if(!action&&method==='DELETE'){await change(data=>{own(data,id);delete data.playlists[id];});return {ok:true};}
    if(action==='items'&&!entryId&&method==='POST'){
      const item=parseItem(body),entry=crypto.randomUUID();
      await change(data=>{const p=own(data,id),entries=sortedItems(p);if(entries.some(e=>e.item_type===item.item_type&&e.item_id===item.item_id&&(e.reciter_id||null)===item.reciter_id))throw firebase.error('Already in this playlist',409);p.items||={};p.items[entry]={...item,id:entry,position:entries.length?Math.max(...entries.map(e=>e.position))+1:0,added_at:now()};});return {ok:true};
    }
    if(action==='items'&&entryId&&method==='DELETE'){await change(data=>{const p=own(data,id);if(!Object.hasOwn(p.items||{},entryId))throw firebase.error('Item not in playlist',404);delete p.items[entryId];});return {ok:true};}
    if(action==='order'&&method==='PUT'){
      await change(data=>{const p=own(data,id),ids=body.entry_ids,entries=Object.keys(p.items||{});if(!Array.isArray(ids)||ids.length!==entries.length||new Set(ids).size!==ids.length||!ids.every(i=>entries.includes(i)))throw firebase.error('Provide every playlist entry exactly once.');ids.forEach((i,index)=>{p.items[i].position=index;});});return {ok:true};
    }
  }
  if(path==='/likes'&&method==='GET')return {likes:Object.values(record.likes||{}).sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(catalogue.enrich).filter(Boolean)};
  if(path==='/likes/toggle'&&method==='POST'){
    const item=parseItem(body),key=[item.item_type,item.item_id,item.reciter_id||0].join(':');
    const liked=await change(data=>{data.likes||={};if(data.likes[key]){delete data.likes[key];return false;}data.likes[key]={...item,id:key,created_at:now()};return true;});return {liked};
  }
  if(path==='/history'){
    if(method==='GET'){const limit=Math.max(1,Math.min(Math.floor(Number(params.get('limit')))||20,200));return {history:Object.values(record.history||{}).sort((a,b)=>b.last_played.localeCompare(a.last_played)).slice(0,limit).map(i=>({...catalogue.enrich(i),last_played:i.last_played})).filter(i=>i.type)};}
    if(method==='POST'){
      const item=parseItem(body),key=[item.item_type,item.item_id,item.reciter_id||0].join(':');
      await change(data=>{data.history||={};const date=now(),previous=data.history[key];data.history[key]={...item,id:key,last_played:date,plays:(previous?.plays||0)+1,days:{...previous?.days,[date.slice(0,10)]:true}};});return {ok:true};
    }
    if(method==='DELETE'){await change(data=>{delete data.history;delete data.progress;});return {ok:true};}
  }
  if(path==='/history/progress'&&method==='POST'){
    const item=parseItem(body),key=[item.item_type,item.item_id,item.reciter_id||0].join(':'),{seconds,duration,completed}=body;
    if(typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0||typeof duration!=='number'||!Number.isFinite(duration)||duration<0||duration>86400||seconds>duration+1||(completed!==undefined&&typeof completed!=='boolean'))throw firebase.error('Invalid playback progress.');
    await change(data=>{data.progress||={};data.progress[key]={...item,seconds,duration,completed:!!(completed||data.progress[key]?.completed),updated_at:now()};});return {ok:true};
  }
  if(path==='/history/stats'&&method==='GET'){
    const progress=Object.values(record.progress||{});return {plays:Object.values(record.history||{}).reduce((sum,i)=>sum+(i.plays||1),0),completed_surahs:new Set(progress.filter(i=>i.item_type==='surah'&&i.completed).map(i=>i.item_id)).size,progress:progress.sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,200)};
  }
  if(path==='/home'&&method==='GET')return home(record,params);
  throw firebase.error('This action could not be found.',404);
}

function home(record,params){
  const current=new Date();let timezone=params.get('timezone')||'UTC';try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format(current);}catch{timezone='UTC';}
  const isFriday=new Intl.DateTimeFormat('en',{timeZone:timezone,weekday:'short'}).format(current)==='Fri';
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(current),day=Math.floor(new Date(date+'T00:00:00Z')/86400000),id=isFriday?18:day%114+1;
  const reciter=catalogue.listReciters().reciters[0],card=id=>catalogue.getSurah(id,{reciter:reciter.id});
  const recent=Object.values(record.history||{}).sort((a,b)=>b.last_played.localeCompare(a.last_played)).slice(0,10).map(row=>({...catalogue.enrich(row),last_played:row.last_played}));
  const days=new Set(Object.values(record.history||{}).flatMap(row=>Object.keys(row.days||{[row.last_played.slice(0,10)]:true}))),cursor=new Date();if(!days.has(cursor.toISOString().slice(0,10)))cursor.setUTCDate(cursor.getUTCDate()-1);
  let streak=0;while(days.has(cursor.toISOString().slice(0,10))){streak++;cursor.setUTCDate(cursor.getUTCDate()-1);}
  return {user:{id:record.profile.id,name:record.profile.name},is_friday:isFriday,streak,surah_of_the_day:card(id),quick_access:[{kind:'surah',label:'Surah Al-Kahf',sublabel:'Friday Blessing',surah:card(18)},{kind:'surah',label:'Surah Yaseen',sublabel:'Surah 36 · 83 verses',surah:card(36)},{kind:'surah',label:'Surah Ar-Rahman',sublabel:'The Beneficent',surah:card(55)},{kind:'collection',label:'Reflective Listening',sublabel:'Browse Nasheeds',query:'/tracks?type=nasheed'},{kind:'collection',label:'Peaceful Nasheeds',sublabel:'Vocal Harmony & Daff',query:'/tracks?type=nasheed'},{kind:'collection',label:'Friday Special',sublabel:'Spiritual Reflections',query:'/tracks?type=naat'}],reciters:catalogue.listReciters().reciters,trending_nasheeds:catalogue.listTracks({type:'nasheed',limit:12}).tracks,beautiful_naths:catalogue.listTracks({type:'naat',limit:12}).tracks,recently_played:recent};
}
const prayerCache=new Map();
async function prayer(params){
  const city=params.get('city'),country=params.get('country'),method=Number(params.get('method')||3);
  if(!city?.trim()||city.length>100||!country?.trim()||country.length>100||!methods.includes(method))throw firebase.error('Enter a city, country and valid calculation method.');
  const current=new Date(),date=[current.getUTCDate(),current.getUTCMonth()+1,current.getUTCFullYear()].join('-'),key=JSON.stringify([city,country,method,date]);
  const localDate=zone=>new Intl.DateTimeFormat('en-GB',{timeZone:zone,day:'2-digit',month:'2-digit',year:'numeric'}).format(current).replaceAll('/','-');
  const cached=prayerCache.get(key);if(cached&&cached.date.gregorian.date===localDate(cached.timezone))return cached;
  try{
    const query=new URLSearchParams({city,country,method:String(method)}),fetchDay=async day=>{const response=await firebase.fetchSafe('https://api.aladhan.com/v1/timingsByCity/'+day+'?'+query);if(!response.ok)throw Error();const {data}=await response.json();if(!data?.timings||!data?.meta?.timezone)throw Error();return data;};
    let data=await fetchDay(date),locationDate=localDate(data.meta.timezone);if(data.date.gregorian.date!==locationDate)data=await fetchDay(locationDate);
    const result={city,country,timings:data.timings,timezone:data.meta.timezone,date:data.date,method:data.meta.method.name,source:'AlAdhan'};
    if(prayerCache.size>200)prayerCache.clear();prayerCache.set(key,result);return result;
  }catch{throw firebase.error('Prayer times are unavailable. Check your city and internet connection, then try again.',502);}
}
