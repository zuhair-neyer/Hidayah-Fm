const {port,host}=require('./config');
const express=require('express');
const path=require('node:path');
const db=require('./db');
require('./seed');
const {notFound,errorHandler}=require('./middleware/errorHandler');
const app=express();
app.disable('x-powered-by');
app.set('query parser','simple');
if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
app.use((req,res,next)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; media-src 'self' https:; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
 if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
 if(['/reset-password','/reset-password.html','/firebase-email-action'].includes(req.path)){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
 }
 next();
});
app.use(express.json({limit:'256kb'}));
app.use('/api',(req,res,next)=>{
 if(Object.values(req.query).some(v=>typeof v!=='string'))return res.status(400).json({error:'Query parameters must have one string value.'});
 if(req.body==null)req.body={};
 if(typeof req.body!=='object'||Array.isArray(req.body))return res.status(400).json({error:'Send a JSON object.'});
 next();
});
const attempts=new Map();
const limiter=(req,res,next)=>{
 const key=req.ip,now=Date.now(); let entry=attempts.get(key);
 if(!entry||entry.reset<now){entry={count:0,reset:now+15*60000};attempts.set(key,entry)}
 if(++entry.count>40){res.setHeader('Retry-After',Math.ceil((entry.reset-now)/1000));return res.status(429).json({error:'Too many attempts. Please try again in 15 minutes.'});}
 if(attempts.size>5000)for(const[k,v]of attempts)if(v.reset<now)attempts.delete(k);
 next();
};
const publicAuth=['/auth/login','/auth/signup','/auth/refresh','/auth/reset-password','/auth/reset-password/verify','/auth/reset-password/confirm'];
app.post(['/api/auth/login','/api/auth/signup','/api/auth/change-password','/api/auth/reset-password','/api/auth/reset-password/verify','/api/auth/reset-password/confirm'],limiter);
app.get('/api/health',(req,res)=>res.json({ok:true,app:'Hidayah FM',version:'3.0.0',authentication:'Firebase'}));
app.use('/api',(req,res,next)=>{if(publicAuth.includes(req.path))return next();return require('./middleware/auth').requireAuth(req,res,next);});
for(const route of ['auth','surahs','reciters','tracks','playlists','likes','history','home','prayer'])app.use('/api/'+route,require('./routes/'+route+'.routes'));
app.use('/api',notFound);
app.get('/reset-password',(req,res)=>res.sendFile(path.join(__dirname,'../public/reset-password.html')));
// Firebase applies the custom action URL to every email template. Keep its other
// account actions available on the trusted Firebase handler, never a supplied URL.
app.get('/firebase-email-action',(req,res)=>{
 const {mode,oobCode}=req.query;
 if(!['verifyEmail','recoverEmail'].includes(mode)||typeof oobCode!=='string'||!oobCode||oobCode.length>2048||/\s/.test(oobCode))return res.status(400).send('Open a valid account action link from your email.');
 const config=require('./firebase-config');
 const target=new URL('https://'+config.authDomain+'/__/auth/action');
 target.search=new URLSearchParams({mode,oobCode,apiKey:config.apiKey}).toString();
 res.redirect(303,target.href);
});
const legacy=['/home.html','/quran.html','/library.html','/now-playing.html','/account.html','/login.html','/signup.html'];
app.get(legacy,(req,res)=>res.sendFile(path.join(__dirname,'../public/index.html')));
app.use(express.static(path.join(__dirname,'../public'),{dotfiles:'deny',maxAge:0}));
app.use((req,res)=>res.status(404).sendFile(path.join(__dirname,'../public/404.html')));
app.use(errorHandler);
if(require.main===module){
 const server=app.listen(port,host,()=>console.log('Hidayah FM: http://'+host+':'+port));
 server.on('error',err=>{console.error(err.code==='EADDRINUSE'?'Port '+port+' is busy. Set PORT to another port.':err.message);process.exitCode=1});
 const close=()=>server.close(()=>{db.close();process.exit(0)});
 process.on('SIGTERM',close);process.on('SIGINT',close);
}
module.exports=app;
