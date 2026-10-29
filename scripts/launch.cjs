const {spawn}=require('node:child_process');
const {createServer,settings}=require('./serve-static.cjs');
const {port,host}=settings();
let server;
function listen(candidate){
 server=createServer({allowLocalEmulators:['localhost','127.0.0.1','::1'].includes(host)}).listen(candidate,host,()=>{
  const url='http://'+(host==='0.0.0.0'?'127.0.0.1':host.includes(':')?'['+host+']':host)+':'+candidate;
  console.log('\nHidayah FM is ready: '+url+'\nKeep this window open while previewing locally. Press Ctrl+C to stop.\n');
  if(process.platform==='win32'){
   const browser=spawn('cmd.exe',['/c','start','',url],{windowsHide:true,stdio:'ignore'});
   browser.on('error',()=>console.log('Open the address above in your browser.'));
  }
 });
 server.on('error',error=>{
  if(error.code==='EADDRINUSE'&&candidate<Math.min(port+10,65535))return listen(candidate+1);
  console.error(error.message);process.exitCode=1;
 });
}
listen(port);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
