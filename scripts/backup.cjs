const fs=require('node:fs');
const path=require('node:path');
const {validateCatalogue}=require('./export-static-data.cjs');
const root=path.resolve(__dirname,'..');
const source=path.join(root,'public/data/catalogue.json');
const destination=path.resolve(process.argv[2]||path.join(root,'work','backups','hidayah-catalogue-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'));
try{
 const bytes=fs.readFileSync(source);validateCatalogue(JSON.parse(bytes));
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 fs.writeFileSync(destination,bytes,{flag:'wx'});
 console.log('Static catalogue backup saved: '+destination+'\nKeep public/media with your backup if you imported recordings. User data lives in Firebase; use Account > Export your data for your library.');
}catch(error){console.error(error.code==='EEXIST'?'Refusing to overwrite an existing backup: '+destination:error.message);process.exitCode=1}
