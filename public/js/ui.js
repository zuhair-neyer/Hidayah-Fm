export const $=(s,root=document)=>root.querySelector(s);
export const $$=(s,root=document)=>[...root.querySelectorAll(s)];
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const paths={
 home:'m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
 search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 book:'M12 6v15M3 3h4a5 5 0 0 1 5 3 5 5 0 0 1 5-3h4v16h-4a5 5 0 0 0-5 2 5 5 0 0 0-5-2H3Z',
 library:'M4 4v16M9 4v16M15 4l5 15M3 20h7',heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
 plus:'M12 5v14M5 12h14',moon:'M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10Z',
 settings:'m9 3-1 3-3 1-2 4 2 3v3l4 2 3-1 3 1 4-2v-3l2-3-2-4-3-1-1-3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 play:'m9 5 11 7-11 7Z',pause:'M8 5v14M16 5v14',next:'m5 5 10 7-10 7ZM19 5v14',previous:'m19 5-10 7 10 7ZM5 5v14',
 shuffle:'M3 6h3c5 0 7 12 12 12h3m-3-3 3 3-3 3M3 18h3c2 0 3-2 5-5m3-5c1-1 2-2 4-2h3m-3-3 3 3-3 3',
 repeat:'m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3',
 queue:'M3 5h15M3 10h15M3 15h8m5-1 6 4-6 4Z',volume:'m11 4-6 4H2v8h3l6 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
 mute:'m11 4-6 4H2v8h3l6 4Zm5 5 5 6m0-6-5 6',menu:'M3 6h18M3 12h18M3 18h18',close:'m6 6 12 12M6 18 18 6',
 arrow:'M4 12h16m-6-6 6 6-6 6',chevron:'m9 5 7 7-7 7',back:'m15 5-7 7 7 7',down:'m6 9 6 6 6-6',up:'m6 15 6-6 6 6',
 music:'M9 18V5l12-3v14M9 6l12-3M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0m12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
 check:'m5 12 4 4L19 6',external:'M14 3h7v7m0-7L10 14M10 3H4v17h17v-6',
 user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2',
 pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 grid:'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',list:'M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1',
 more:'M5 12h.01M12 12h.01M19 12h.01',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
 edit:'m16 3 5 5L8 21H3v-5Zm-2 2 5 5',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
 copy:'M9 8h12v13H9ZM5 16H3V3h12v2',bookmark:'M5 3h14v19l-7-5-7 5Z',sun:'M12 2v2M12 20v2M2 12h2M20 12h2m-3-7 2-2M5 19l-2 2M5 5  -2-2m14 14 2 2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
 headphones:'M3 14v-2a9 9 0 0 1 18 0v2M3 12h4v9H3Zm14 0h4v9h-4Z',
 logout:'M9 3H3v18h6m7-15 5 6-5 6M8 12h13',shield:'m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6Zm-5 10 3 3 7-7'
};
export const icon=(name,cls='')=>`<svg class="icon ${cls}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name]||paths.music}"/></svg>`;
export function hydrate(root=document){$$('[data-icon]',root).forEach(el=>{el.innerHTML=icon(el.dataset.icon);el.removeAttribute('data-icon')});}
export const fmt=s=>{s=Number.isFinite(s)?Math.max(0,Math.floor(s)):0;return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
export function toast(message){const el=document.createElement('div');el.className='toast';el.textContent=message;$('#toasts').append(el);setTimeout(()=>el.remove(),4500);}
export function dialog(title,content){const modal=$('#modal');modal.setAttribute('aria-labelledby','dialog-title');$('#modal-content').innerHTML=`<div class="modal-heading"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>${content}`;if(!modal.open)modal.showModal();return modal;}
export function closeDialog(){$('#modal').close();$('#modal-content').innerHTML='';}
export function safeUrl(value){try{const url=new URL(value,location.origin);return ['https:','http:'].includes(url.protocol)?url.href:null}catch{return null}}
export function empty(title,text,button=''){return `<div class="empty-state">${icon('headphones')}<h2 id="dialog-title">${esc(title)}</h2><p>${esc(text)}</p>${button}</div>`;}
export function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
export function writeStore(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
