import {firebaseEmailActionURL} from './firebase-config.js';
import {api,clearSession} from './client.js';
import {esc,icon} from './ui.js';

const content=document.querySelector('#reset-content');
const params=new URLSearchParams(location.search);
let code=params.get('oobCode')||'';
let accountEmail='';
const mode=params.get('mode');
const back='<a class="text-link" href="/#/login">Back to sign in</a>';
const newLink='<button class="text-link" type="button" data-action="request-link">Request a new link</button>';

function render(html){
  content.innerHTML=html;
  content.setAttribute('aria-busy','false');
  document.querySelector('#reset-title')?.focus({preventScroll:true});
}
function heading(title){return `<h2 id="reset-title" tabindex="-1">${esc(title)}</h2>`;}
function requestForm(message='',title='Reset your password'){
  render(`${heading(title)}<p>${esc(message||'Enter your email address and we’ll send you a secure link to choose a new password.')}</p><form id="reset-request-form"><label class="field-label" for="reset-email">Email address<input class="field" id="reset-email" name="email" type="email" maxlength="254" autocomplete="email" value="${esc(accountEmail)}" placeholder="you@example.com" required></label><p class="form-error" role="alert"></p><button class="button primary" type="submit">Send reset link ${icon('arrow')}</button></form><div class="reset-actions">${back}</div>`);
}
function passwordField(label,name){
  return `<label class="field-label" for="${name}">${label}</label><div class="password-field"><input class="field" id="${name}" name="${name}" type="password" required minlength="8" maxlength="128" autocomplete="new-password" aria-describedby="password-hint"><button class="icon-button" type="button" data-action="show-password" aria-label="Show ${label.toLowerCase()}" aria-controls="${name}" aria-pressed="false">Show</button></div>`;
}
function passwordForm(){
  render(`${heading('Choose a new password')}<p>A fresh start for <span class="reset-account">${esc(accountEmail)}</span>.</p><form id="new-password-form">${passwordField('New password','new_password')}${passwordField('Confirm new password','confirm')}<p class="reset-hint" id="password-hint">Use 8–128 characters. A long, unique password helps keep your account secure.</p><p class="form-error" role="alert"></p><button class="button primary" type="submit">Save new password ${icon('arrow')}</button></form><div class="reset-actions">${back}${newLink}</div>`);
}
async function verify(){
  render(`${heading('Checking your reset link')}<p role="status">Just a moment while we check your secure link.</p>`);
  content.setAttribute('aria-busy','true');
  try{
    const result=await api('/auth/reset-password/verify','POST',{oobCode:code});
    accountEmail=result.email;
    passwordForm();
  }catch(error){
    if(error.status===400||error.status===401){requestForm(error.message,'This link cannot be used');}
    else render(`${heading('Let’s try that again')}<p role="alert">${esc(error.message)}</p><button class="button primary" type="button" data-action="retry">Check link again</button><div class="reset-actions">${back}${newLink}</div>`);
  }
}
content.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');
  if(!button)return;
  if(button.dataset.action==='request-link'){requestForm();return;}
  if(button.dataset.action==='retry'){void verify();return;}
  if(button.dataset.action==='show-password'){
    const input=document.getElementById(button.getAttribute('aria-controls'));
    const show=input.type==='password';
    input.type=show?'text':'password';button.textContent=show?'Hide':'Show';
    button.setAttribute('aria-label',(show?'Hide ':'Show ')+(input.name==='confirm'?'confirm new password':'new password'));
    button.setAttribute('aria-pressed',String(show));
  }
});
content.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.target,submit=form.querySelector('[type=submit]'),errorBox=form.querySelector('.form-error');
  if(submit.disabled)return;
  const values=Object.fromEntries(new FormData(form));
  errorBox.textContent='';
  if(form.id==='new-password-form'&&values.new_password!==values.confirm){errorBox.textContent='Passwords do not match.';document.getElementById('confirm').focus();return;}
  const label=submit.innerHTML;
  submit.disabled=true;submit.textContent=form.id==='new-password-form'?'Saving password…':'Sending link…';form.setAttribute('aria-busy','true');
  // Prevent switching views while an action is in flight.
  content.querySelectorAll('[data-action=request-link]').forEach(button=>button.disabled=true);
  try{
    if(form.id==='reset-request-form'){
      const result=await api('/auth/reset-password','POST',{email:values.email});accountEmail=values.email;
      render(`<div class="reset-success">${icon('check')}</div>${heading('Check your inbox')}<p role="status">${esc(result.message)}</p><p>Open the newest reset email to choose your new password.</p><div class="reset-actions">${back}<button class="text-link" type="button" data-action="request-link">Use another email</button></div>`);
    }else if(form.id==='new-password-form'){
      const result=await api('/auth/reset-password/confirm','POST',{oobCode:code,new_password:values.new_password});
      code='';history.replaceState(null,'',location.pathname);
      try{clearSession();}catch{/* The password change succeeds even if browser storage is unavailable. */}
      render(`<div class="reset-success">${icon('check')}</div>${heading('Password updated')}<p role="status">${esc(result.message)}</p><a class="button primary" href="/#/login">Back to sign in ${icon('arrow')}</a>`);
    }
  }catch(error){errorBox.textContent=error.message;}
  finally{
    if(form.isConnected){submit.disabled=false;submit.innerHTML=label;form.setAttribute('aria-busy','false');content.querySelectorAll('[data-action=request-link]').forEach(button=>button.disabled=false);}
  }
});

if(!location.search){requestForm();}
else if(['verifyEmail','recoverEmail'].includes(mode)&&code&&code.length<=2048&&!/\s/.test(code)&&params.getAll('mode').length===1&&params.getAll('oobCode').length===1){
  const link=firebaseEmailActionURL(mode,code);
  render(`${heading(mode==='verifyEmail'?'Verify your email':'Recover your email')}<p>This account action will be completed securely with Firebase.</p><a class="button primary" href="${esc(link)}">Continue securely with Firebase</a><div class="reset-actions">${back}</div>`);
}else if(mode!=='resetPassword'||!code||code.length>2048||/\s/.test(code)||params.getAll('mode').length!==1||params.getAll('oobCode').length!==1){
  requestForm('This reset link is incomplete or invalid. Open the full link from your email, or request a new one below.','This link cannot be used');
}else{void verify();}
