const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {createServer,productionCSP}=require('../scripts/serve-static.cjs');
const root=path.resolve(__dirname,'..');
let server,port;
before(async()=>{server=createServer();server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));port=server.address().port;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
function request(url,options={}){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:url,...options},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end();});}

test('static preview serves the app, JS modules, complete JSON and old bookmarked pages',async()=>{
 const app=await request('/');assert.equal(app.status,200);assert.match(app.headers['content-type'],/text\/html/);assert.match(app.body.toString(),/Hidayah FM/);
 const js=await request('/js/catalogue.js');assert.equal(js.status,200);assert.match(js.headers['content-type'],/text\/javascript/);
 const json=await request('/data/catalogue.json');assert.equal(JSON.parse(json.body).tracks.length,120);
 for(const page of ['home','quran','library','now-playing','account','login','signup']){const response=await request('/'+page+'.html');assert.equal(response.status,200);assert.match(response.body.toString(),/legacy-route\.js/);}
 assert.equal((await request('/missing-file.html')).status,404);
});

test('preview rejects APIs, writes, traversal and private source files',async()=>{
 assert.equal((await request('/api/health')).status,404);
 assert.equal((await request('/api/auth/login',{method:'POST'})).status,405);
 assert.equal((await request('/data/catalogue.json',{method:'PUT'})).status,405);
 for(const target of ['/../README.md','/%2e%2e/README.md','/.env','/%2eenv','/js/../../package.json','/js%5c..%5c..%5cpackage.json','/%00'])assert.equal((await request(target)).status,403,target);
 for(const target of ['/server/index.js','/package.json','/database.rules.json','/work/private.json'])assert.equal((await request(target)).status,404,target);
 assert.equal((await request('/%ZZ')).status,400);
});

test('HEAD and byte ranges support media seeking without changing source files',async()=>{
 const bytes=fs.readFileSync(path.join(root,'public/assets/logo.svg'));
 const head=await request('/assets/logo.svg',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body.length,0);assert.equal(Number(head.headers['content-length']),bytes.length);
 const part=await request('/assets/logo.svg',{headers:{Range:'bytes=0-15'}});assert.equal(part.status,206);assert.deepEqual(part.body,bytes.subarray(0,16));assert.equal(part.headers['content-range'],`bytes 0-15/${bytes.length}`);
 const tail=await request('/assets/logo.svg',{headers:{Range:'bytes=-10'}});assert.equal(tail.status,206);assert.deepEqual(tail.body,bytes.subarray(-10));
 const invalid=await request('/assets/logo.svg',{headers:{Range:'bytes=999999-'}});assert.equal(invalid.status,416);assert.equal(invalid.headers['content-range'],'bytes */'+bytes.length);
});

test('deployment headers allow required services and omit local test endpoints',async()=>{
 const response=await request('/index.html');assert.equal(response.headers['content-security-policy'],productionCSP);
 assert.equal(response.headers['referrer-policy'],'strict-origin-when-cross-origin');
 assert.ok(!productionCSP.includes('http://'));
 const reset=await request('/reset-password.html');assert.equal(reset.headers['referrer-policy'],'no-referrer');assert.equal(reset.headers['cache-control'],'no-store');
 const hosting=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8')).hosting;
 assert.equal(hosting.public,'public');assert.ok(!hosting.rewrites);assert.ok(!hosting.functions);
 assert.equal(hosting.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value,productionCSP);
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));assert.deepEqual(pkg.dependencies,{});assert.equal(pkg.scripts.start,'node scripts/serve-static.cjs');
});
