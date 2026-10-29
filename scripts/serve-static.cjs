// Optional local preview only. Production hosting serves public/ directly.
// This file uses Node built-ins and has no API, database or account endpoints.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {pipeline}=require('node:stream');
const publicRoot=path.resolve(__dirname,'../public');
const productionCSP="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseio.com https://*.firebasedatabase.app https://api.aladhan.com; media-src 'self' https:; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.mp3':'audio/mpeg','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.wav':'audio/wav','.flac':'audio/flac','.mp4':'video/mp4','.webm':'video/webm','.txt':'text/plain; charset=utf-8'};
function settings(){
 const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer from 1 to 65535.');
 if(!/^[A-Za-z0-9.:-]+$/.test(host))throw new Error('HOST must be an IP address or hostname.');
 return {port,host};
}
function contained(root,file){const relative=path.relative(root,file);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
function createServer(options={}){
 const root=fs.realpathSync(options.root||publicRoot);
 const csp=options.allowLocalEmulators?productionCSP.replace("; media-src",' http://127.0.0.1:9099 http://127.0.0.1:9000 http://localhost:9099 http://localhost:9000; media-src'):productionCSP;
 return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Content-Security-Policy',csp);res.setHeader('Cache-Control','no-cache');
  const reply=(status,message)=>{res.statusCode=status;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(req.method==='HEAD'?undefined:message);};
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');reply(405,'This static site only serves files.');return;}
  let pathname;
  try{pathname=decodeURIComponent((req.url||'/').split('?')[0]);}catch{reply(400,'Invalid request path.');return;}
  if(!pathname.startsWith('/')||pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(segment=>segment.startsWith('.'))){reply(403,'This path is not available.');return;}
  if(pathname==='/api'||pathname.startsWith('/api/')){reply(404,'This static app has no API server.');return;}
  if(pathname==='/reset-password.html'){res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');}
  if(pathname.endsWith('/'))pathname+='index.html';
  const requested=path.resolve(root,'.'+pathname);
  if(!contained(root,requested)){reply(403,'This path is not available.');return;}
  let file,stat;
  try{file=await fs.promises.realpath(requested);if(!contained(root,file)){reply(403,'This path is not available.');return;}stat=await fs.promises.stat(file);if(!stat.isFile()){reply(404,'File not found.');return;}}
  catch(error){reply(error.code==='ENOENT'||error.code==='ENOTDIR'?404:500,'File not found.');return;}
  res.setHeader('Content-Type',types[path.extname(file).toLowerCase()]||'application/octet-stream');res.setHeader('Accept-Ranges','bytes');res.setHeader('Last-Modified',stat.mtime.toUTCString());
  let start=0,end=stat.size-1;
  if(req.headers.range){
   const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
   if(range&&(range[1]||range[2])){
    if(!range[1]){const suffix=Number(range[2]);start=Math.max(0,stat.size-suffix);}else{start=Number(range[1]);if(range[2])end=Math.min(Number(range[2]),stat.size-1);}
   }else start=-1;
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=stat.size||end<start){res.setHeader('Content-Range','bytes */'+stat.size);reply(416,'Requested range is unavailable.');return;}
   res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${stat.size}`);
  }
  res.setHeader('Content-Length',Math.max(0,end-start+1));
  if(req.method==='HEAD'||stat.size===0){res.end();return;}
  pipeline(fs.createReadStream(file,{start,end}),res,error=>{if(error&&!res.destroyed)res.destroy(error);});
 });
}
module.exports={createServer,settings,productionCSP};
if(require.main===module){
 try{
  const {host,port}=settings(),server=createServer({allowLocalEmulators:['localhost','127.0.0.1','::1'].includes(host)});
  server.listen(port,host,()=>console.log('Hidayah FM static preview: http://'+(host==='0.0.0.0'?'127.0.0.1':host.includes(':')?'['+host+']':host)+':'+port));
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port '+port+' is busy. Choose another PORT.':error.message);process.exitCode=1;});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
