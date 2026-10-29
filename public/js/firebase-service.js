import {firebaseConfig as config,emulators} from './firebase-config.js';

const authBase=emulators?`http://${emulators.authHost}/identitytoolkit.googleapis.com/v1`:'https://identitytoolkit.googleapis.com/v1';
const refreshBase=emulators?`http://${emulators.authHost}/securetoken.googleapis.com/v1`:'https://securetoken.googleapis.com/v1';
const databaseBase=emulators?`http://${emulators.databaseHost}`:config.databaseURL;
export const error=(message,status=400)=>Object.assign(new Error(message),{status});
export async function fetchSafe(url,options={}){
  try{return await fetch(url,{...options,signal:AbortSignal.timeout(20000)});}
  catch{throw error('The service could not be reached. Check your connection and try again.',503);}
}
function authError(message=''){
  const code=message.split(' : ')[0];
  const known={
    EMAIL_EXISTS:['This email is already registered. Please sign in.',409],
    INVALID_LOGIN_CREDENTIALS:['Email or password is incorrect.',401],
    EMAIL_NOT_FOUND:['Email or password is incorrect.',401],
    INVALID_PASSWORD:['Email or password is incorrect.',401],
    USER_DISABLED:['This account has been disabled.',401],
    INVALID_EMAIL:['Enter a valid email address.',400],
    WEAK_PASSWORD:['Use a stronger password with at least 8 characters.',400],
    PASSWORD_DOES_NOT_MEET_REQUIREMENTS:['Your password does not meet the account password requirements. Try a longer password with uppercase and lowercase letters, a number and a symbol.',400],
    EXPIRED_OOB_CODE:['This reset link has expired. Please request a new one.',400],
    INVALID_OOB_CODE:['This reset link is invalid or has already been used. Please request a new one.',400],
    MISSING_OOB_CODE:['Open the complete password reset link from your email.',400],
    TOO_MANY_ATTEMPTS_TRY_LATER:['Too many attempts. Please try again later.',429],
    RESET_PASSWORD_EXCEED_LIMIT:['Too many reset requests. Please try again later.',429],
    TOKEN_EXPIRED:['Your session expired. Please sign in again.',401],
    INVALID_ID_TOKEN:['Your session expired. Please sign in again.',401],
    INVALID_REFRESH_TOKEN:['Your session expired. Please sign in again.',401],
    USER_NOT_FOUND:['Your session expired. Please sign in again.',401],
    CREDENTIAL_TOO_OLD_LOGIN_AGAIN:['Please sign in again before changing your account.',401],
    CONFIGURATION_NOT_FOUND:['Enable Email/Password sign-in in Firebase Authentication for Hidayah FM.',503],
    OPERATION_NOT_ALLOWED:['Enable Email/Password sign-in in Firebase Authentication for Hidayah FM.',503]
  };
  return error(...(known[code]||['Firebase could not complete this request. Please try again.',502]));
}
export async function authRequest(action,body){
  const response=await fetchSafe(`${authBase}/accounts:${action}?key=${config.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw authError(data.error?.message);
  return data;
}
export function claims(token){
  try{return JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));}
  catch{throw error('Please sign in again.',401);}
}
export async function identity(token){
  const result=await authRequest('lookup',{idToken:token}),user=result.users?.[0];
  if(!user||user.disabled)throw error('Please sign in again.',401);
  // Firebase's lookup validates the token; decoded claims alone never grant access.
  const payload=claims(token);
  if(payload.sub!==user.localId||Number(payload.auth_time)<Number(user.validSince||0))throw error('Your session expired. Please sign in again.',401);
  return {id:user.localId,name:user.displayName||'',email:user.email,created_at:new Date(Number(user.createdAt)||Date.now()).toISOString(),auth_time:Number(payload.auth_time),valid_since:Number(user.validSince||0)};
}
export async function refresh(refreshToken){
  const response=await fetchSafe(`${refreshBase}/token?key=${config.apiKey}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken})});
  const data=await response.json();if(!response.ok)throw authError(data.error?.message);
  return {idToken:data.id_token,refreshToken:data.refresh_token,expiresIn:data.expires_in};
}
function databaseURL(uid,token){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw error('Invalid account.',401);
  const url=new URL(`${databaseBase}/users/${encodeURIComponent(uid)}.json`);
  if(emulators)url.searchParams.set('ns',emulators.projectId+'-default-rtdb');
  url.searchParams.set('auth',token);return url;
}
export async function read(uid,token,etag=false){
  const response=await fetchSafe(databaseURL(uid,token),{headers:etag?{'X-Firebase-ETag':'true'}:{}});
  if(!response.ok)throw error('Your Firebase data could not be opened. Sign in again or check the database rules.',response.status===401?401:503);
  return {value:await response.json(),etag:response.headers.get('etag')};
}
export async function transaction(uid,token,change){
  for(let attempt=0;attempt<8;attempt++){
    const snapshot=await read(uid,token,true),record=snapshot.value||{};
    if(!snapshot.etag)throw error('Firebase could not verify this library update. Please try again.',503);
    const result=change(record);
    const response=await fetchSafe(databaseURL(uid,token),{method:'PUT',headers:{'Content-Type':'application/json','If-Match':snapshot.etag},body:JSON.stringify(record)});
    if(response.status===412)continue;
    if(!response.ok)throw error('Your changes could not be saved to Firebase. Check your connection and database rules, then try again.',response.status===401?401:503);
    return result;
  }
  throw error('Your library changed in another session. Please try again.',409);
}
export async function remove(uid,token){
  const response=await fetchSafe(databaseURL(uid,token),{method:'DELETE'});
  if(!response.ok)throw error('Your Firebase data could not be deleted. Please try again.',503);
}
let privateUntil=0;
export async function assertPrivateDatabase(){
  if(Date.now()<privateUntil)return;
  const url=new URL(`${databaseBase}/users.json?shallow=true`);
  if(emulators)url.searchParams.set('ns',emulators.projectId+'-default-rtdb');
  const response=await fetchSafe(url);
  if(response.ok)throw error('Publish the supplied private-user Firebase database rules before signing in.',503);
  if(![401,403].includes(response.status))throw error('The Firebase database could not be checked.',503);
  privateUntil=Date.now()+60000;
}
export async function ensureUser(user,token){
  return transaction(user.id,token,record=>{
    if(!record.profile){
      record.profile={id:user.id,name:user.name||'Listener',email:user.email,created_at:user.created_at};
      const id=crypto.randomUUID();record.playlists={[id]:{id,name:'Heart Soothing',color:'#1db98a',created_at:new Date().toISOString()}};
    }
    // Carry Firebase's password-revocation boundary into rules on every login.
    // This also completes a reset whose follow-up database sync was interrupted.
    if(Number.isInteger(user.valid_since)&&user.valid_since>0&&user.valid_since<=user.auth_time)record.auth_valid_after=Math.max(record.auth_valid_after||0,user.valid_since);
    return record.profile;
  });
}
export function sessionData(data,user){return {token:data.idToken,refreshToken:data.refreshToken,expiresAt:Date.now()+Number(data.expiresIn||3600)*1000,user};}
