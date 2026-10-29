import {$,icon,fmt,toast,readStore,writeStore,safeUrl} from './ui.js';
import {api,session} from './client.js';
const audio=new Audio();audio.preload='metadata';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export const itemKey=i=>i?[i.type,i.id,i.reciter_id||0].join(':'):'';
export const itemBody=i=>({item_type:i.type,item_id:i.id,reciter_id:i.reciter_id||null});
let storageOwner=session.user?.id||'signed-out';
const storageKey=()=> 'hfm_playback_'+storageOwner;
let current=null,queue=[],index=-1,shuffle=false,repeat='off',logged=false,restoreTime=0,lastSave=0,lastProgress=0,sleepDeadline=0,sleepTimer=null;
let lastCloudSave=0,pendingCloud=null,cloudSaving=false,lastCloudWarning=0;
const volume=Number(readStore('hfm_volume',0.8));audio.volume=Number.isFinite(volume)?clamp(volume,0,1):0.8;
// Recitations use their original recorded speed, including after upgrades.
audio.defaultPlaybackRate=1;audio.playbackRate=1;
try{localStorage.removeItem('hfm_speed');}catch{}
function changed(){render();window.dispatchEvent(new Event('player-change'));}
async function flushCloud(){
 if(cloudSaving)return;cloudSaving=true;
 try{while(pendingCloud){const next=pendingCloud;pendingCloud=null;if(next.owner!==session.user?.id)continue;
  try{await api('/auth/playback','PUT',next.value)}catch{if(Date.now()-lastCloudWarning>60000){lastCloudWarning=Date.now();toast('Playback is saved on this device. Cloud sync will retry when connected.');}}
 }}finally{cloudSaving=false;}
}
function save(force=false){
 if(!current||!session.user||storageOwner!==session.user.id)return;
 const value={item:current,queue,index,time:restoreTime||audio.currentTime,shuffle,repeat};writeStore(storageKey(),value);
 if(force||Date.now()-lastCloudSave>15000){lastCloudSave=Date.now();pendingCloud={owner:session.user.id,value};flushCloud();}
}
function progress(completed=false){
 if(!session.token||storageOwner!==session.user?.id||!current||!logged||!Number.isFinite(audio.duration)||audio.duration<=0)return;
 api('/history/progress','POST',{...itemBody(current),seconds:audio.currentTime,duration:audio.duration,completed}).catch(()=>{});
}
function load(item,time=0){
 audio.pause();progress();save();current=item;logged=false;restoreTime=Math.max(0,time);lastProgress=0;
 audio.src=safeUrl(item.audio_url);audio.load();changed();
 if('mediaSession'in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:item.title,artist:item.subtitle,album:'Hidayah FM'});}
}
async function resume(){if(!current)return toast('Choose a recitation to begin.');try{await audio.play()}catch(e){if(e.name!=='AbortError')toast(e.name==='NotAllowedError'?'Press play to continue listening.':'This audio could not be played. Check your connection or choose another reciter.');}changed();}
function render(){
 $('#now-title').textContent=current?.title||'Your next quiet moment';$('#now-subtitle').textContent=current?.subtitle||'Choose a recitation to begin';
 $('#play-toggle').innerHTML=icon(audio.paused?'play':'pause');$('#play-toggle').setAttribute('aria-label',audio.paused?'Play':'Pause');
 $('#player-like').disabled=!current;
 $('#shuffle').classList.toggle('active',shuffle);$('#shuffle').setAttribute('aria-pressed',String(shuffle));
 $('#repeat').classList.toggle('active',repeat!=='off');$('#repeat').setAttribute('aria-pressed',String(repeat!=='off'));$('#repeat').setAttribute('aria-label','Repeat: '+repeat);$('#repeat').title='Repeat: '+repeat;
 $('#repeat').innerHTML=icon('repeat')+(repeat==='one'?'<sup>1</sup>':'');
 $('#volume').value=audio.volume;$('#mute').innerHTML=icon(audio.muted||audio.volume===0?'mute':'volume');$('#mute').setAttribute('aria-label',audio.muted?'Unmute':'Mute');
 $('#sleep-button').classList.toggle('active',sleepDeadline>Date.now());
 document.title=current&&!audio.paused?current.title+' · Hidayah FM':document.title;
}
export const Player={
 audio,get current(){return current},get queue(){return queue},get index(){return index},get shuffle(){return shuffle},get repeat(){return repeat},get sleepDeadline(){return sleepDeadline},
 async play(item,list=[item],time=0){
  if(!item?.audio_url||!safeUrl(item.audio_url))return false;
  if(!session.user)return false;
  storageOwner=session.user.id;
  queue=list.filter(i=>i.audio_url&&safeUrl(i.audio_url)).slice(0,500);
  index=queue.findIndex(i=>itemKey(i)===itemKey(item));if(index<0){queue.unshift(item);index=0;}
  if(itemKey(item)!==itemKey(current)||time>0){load(item,time)}
  await resume();save(true);return true;
 },
 toggle(){if(audio.paused)resume();else audio.pause();},
 step(direction,ended=false){
  if(!queue.length)return;
  if(ended&&repeat==='one'){audio.currentTime=0;resume();return;}
  if(direction<0&&audio.currentTime>3){audio.currentTime=0;return;}
  let next=index+direction;
  if(shuffle&&direction>0&&queue.length>1){next=Math.floor(Math.random()*(queue.length-1));if(next>=index)next++;}
  if(next>=queue.length){if(repeat==='all')next=0;else{audio.pause();changed();return;}}
  if(next<0)next=repeat==='all'?queue.length-1:0;
  index=next;load(queue[index]);resume();save(true);
 },
 enqueue(item){if(!item?.audio_url)return toast('This recording opens on its source website.');queue.push(item);if(!current){index=0;load(item)}save();changed();toast('Added to your queue');},
 remove(indexToRemove){if(indexToRemove===index)return toast('The current recitation stays in the queue.');queue.splice(indexToRemove,1);if(indexToRemove<index)index--;save();changed();},
 select(i){if(queue[i]){index=i;load(queue[i]);resume();save(true);}},
 toggleShuffle(){shuffle=!shuffle;save();changed();toast(shuffle?'Shuffle on':'Shuffle off');},
 toggleRepeat(){repeat={off:'all',all:'one',one:'off'}[repeat];save();changed();toast('Repeat: '+repeat);},
 setSleep(minutes){clearTimeout(sleepTimer);sleepDeadline=minutes?Date.now()+minutes*60000:0;if(minutes)sleepTimer=setTimeout(()=>{audio.pause();sleepDeadline=0;changed();toast('Sleep timer finished. Rest well.');},minutes*60000);changed();},
 seek(seconds){if(Number.isFinite(audio.duration))audio.currentTime=clamp(seconds,0,audio.duration);},
 mute(){audio.muted=!audio.muted;changed();},
 reset(){audio.pause();progress();save();audio.removeAttribute('src');audio.load();current=null;queue=[];index=-1;Player.setSleep(0);changed();},
 restore(){if(!session.user)return;storageOwner=session.user.id;const saved=readStore(storageKey(),null);if(!saved?.item?.audio_url||!safeUrl(saved.item.audio_url))return;queue=Array.isArray(saved.queue)?saved.queue.filter(i=>i?.audio_url&&safeUrl(i.audio_url)).slice(0,500):[saved.item];index=queue.findIndex(i=>itemKey(i)===itemKey(saved.item));if(index<0){queue.unshift(saved.item);index=0;}shuffle=!!saved.shuffle;repeat=['off','all','one'].includes(saved.repeat)?saved.repeat:'off';load(saved.item,Number(saved.time)||0);}
};
audio.addEventListener('loadedmetadata',()=>{if(restoreTime&&Number.isFinite(audio.duration)){audio.currentTime=Math.min(restoreTime,Math.max(0,audio.duration-0.1));restoreTime=0;}$('#duration').textContent=fmt(audio.duration);changed();});
audio.addEventListener('playing',()=>{if(current&&!logged){logged=true;if(session.token)api('/history','POST',itemBody(current)).catch(()=>{});}changed();});
audio.addEventListener('pause',()=>{progress();save(true);changed();});
audio.addEventListener('ended',()=>{progress(true);save();Player.step(1,true);});
audio.addEventListener('timeupdate',()=>{const now=Date.now();$('#elapsed').textContent=fmt(audio.currentTime);$('#duration').textContent=fmt(audio.duration);if(document.activeElement!==$('#seek'))$('#seek').value=Number.isFinite(audio.duration)&&audio.duration?audio.currentTime/audio.duration*1000:0;if(now-lastSave>3000){lastSave=now;save();}if(now-lastProgress>15000){lastProgress=now;progress();}window.dispatchEvent(new Event('player-time'));});
audio.addEventListener('error',()=>{if(current)toast('Unable to load this recording. Try another reciter or check your connection.');changed();});
$('#seek').addEventListener('input',e=>{if(Number.isFinite(audio.duration))audio.currentTime=Number(e.target.value)/1000*audio.duration;});
$('#volume').addEventListener('input',e=>{audio.volume=Number(e.target.value);audio.muted=false;writeStore('hfm_volume',audio.volume);render();});
window.addEventListener('pagehide',()=>save(true));
if('mediaSession'in navigator){for(const[name,handler]of Object.entries({play:()=>resume(),pause:()=>audio.pause(),previoustrack:()=>Player.step(-1),nexttrack:()=>Player.step(1),seekto:d=>Player.seek(d.seekTime),seekbackward:d=>Player.seek(audio.currentTime-(d.seekOffset||10)),seekforward:d=>Player.seek(audio.currentTime+(d.seekOffset||10))})){try{navigator.mediaSession.setActionHandler(name,handler)}catch{}}}
render();
