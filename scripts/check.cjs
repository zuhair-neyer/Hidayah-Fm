const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
let failed=false,count=0;
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(/\.(?:js|cjs)$/.test(entry.name)){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});count++;if(result.status!==0){failed=true;console.error(result.stderr)}}}}
for(const dir of ['server','public/js','scripts','tests'])scan(path.join(root,dir));
console.log(count+' JavaScript files checked.');process.exitCode=failed?1:0;
