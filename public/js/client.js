import {dispatch} from './static-api.js';
import {readStore,writeStore} from './ui.js';
const key='hfm_firebase_session';
const saved=readStore(key,null);
export const session={token:saved?.token||null,refreshToken:saved?.refreshToken||null,expiresAt:saved?.expiresAt||0,user:saved?.user||null};
let revision=0,refreshing=null;
export function saveSession(data){
 const same=session.user?.id===data.user?.id;
 Object.assign(session,{token:data.token,refreshToken:data.refreshToken||(same?session.refreshToken:null),expiresAt:data.expiresAt||(same?session.expiresAt:0),user:data.user});
 revision++;writeStore(key,{...session});
 ['hfm_session','hfm_token','hfm_user'].forEach(k=>localStorage.removeItem(k));
}
export function clearSession(){revision++;Object.assign(session,{token:null,refreshToken:null,expiresAt:0,user:null});localStorage.removeItem(key);}
function expired(){clearSession();window.dispatchEvent(new Event('session-expired'));}
async function send(path,method,body,token){
 try{const data=await dispatch(path,method,body,token);return {ok:true,status:200,json:async()=>data};}
 catch(error){return {ok:false,status:error.status||500,json:async()=>({error:error.message||'Something went wrong. Please try again.'})};}
}
async function renew(){
 if(refreshing)return refreshing;
 const version=revision,refreshToken=session.refreshToken;
 if(!refreshToken){expired();throw new Error('Please sign in again.');}
 refreshing=(async()=>{
  const response=await send('/auth/refresh','POST',{refreshToken},null),data=await response.json().catch(()=>({}));
  if(version!==revision)return;
  if(!response.ok){if(response.status===401)expired();throw Object.assign(new Error(data.error||'Your session could not be renewed.'),{status:response.status});}
  saveSession(data);
 })().finally(()=>{refreshing=null});
 return refreshing;
}
export async function api(path,method='GET',body,retry=true){
 const publicAuth=['/auth/signup','/auth/login','/auth/reset-password','/auth/reset-password/verify','/auth/reset-password/confirm'].includes(path);
 if(!publicAuth&&session.token&&Date.now()>=session.expiresAt-60000)await renew();
 const token=publicAuth?null:session.token;
 const response=await send(path,method,body,token),data=await response.json().catch(()=>({}));
 if(!response.ok){
  if(response.status===401&&token&&token===session.token&&!publicAuth){
   if(retry&&session.refreshToken){await renew();return api(path,method,body,false);}
   expired();
  }
  throw Object.assign(new Error(data.error||'Something went wrong. Please try again.'),{status:response.status});
 }
 return data;
}
window.addEventListener('storage',event=>{
 if(event.key!==key)return;
 const before=session.user?.id,data=readStore(key,null);revision++;
 Object.assign(session,{token:data?.token||null,refreshToken:data?.refreshToken||null,expiresAt:data?.expiresAt||0,user:data?.user||null});
 if(before!==session.user?.id)window.dispatchEvent(new Event('session-changed'));
});
