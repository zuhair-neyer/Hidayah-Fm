const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const args=process.argv.slice(2);
if(!args.length||args.includes('--help')){console.log('Attach audio: npm run media -- --id 1 --file "C:/Music/recording.mp3"\nOr: npm run media -- --id 1 --audio-url https://example.com/recording.mp3\nAdd a track: npm run media -- --title "Title" --artist "Artist" --type nasheed --file "recording.mp3"\nOptions: --link-url https://..., --language English. Use recordings you have permission to distribute.');process.exit(0)}
const options={};for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||!args[i+1])throw new Error('Options must have values. Use --help.');options[args[i].slice(2)]=args[i+1]}
const catalogueFile=path.join(__dirname,'../public/data/catalogue.json');
const {validateCatalogue}=require('./export-static-data.cjs');
try{
 const catalogue=validateCatalogue(JSON.parse(fs.readFileSync(catalogueFile,'utf8')));
 const id=Number(options.id),existing=options.id?catalogue.tracks.find(track=>track.id===id):null;
 if(options.id&&(!Number.isSafeInteger(id)||!existing))throw new Error('Track ID was not found.');
 const title=(options.title||existing?.title||'').trim(),artist=(options.artist||existing?.artist||'').trim(),type=options.type||existing?.type;
 if(!title||title.length>120||!artist||artist.length>120||!['nasheed','naat'].includes(type))throw new Error('Provide a title, artist, and type (nasheed or naat).');
 function url(value){if(!value)return null;const u=new URL(value);if(u.protocol!=='https:')throw new Error('Remote media and source links must use HTTPS.');return u.href}
 let audio=options['audio-url']?url(options['audio-url']):existing?.audio_url||null;
 const link=options['link-url']?url(options['link-url']):existing?.link_url||null;
 if(options.file){
  const source=path.resolve(options.file),ext=path.extname(source).toLowerCase();
  if(!['.mp3','.m4a','.ogg','.wav','.aac','.flac'].includes(ext))throw new Error('Choose a supported audio file.');
  if(!fs.statSync(source).isFile())throw new Error('The source must be a file.');
  const dir=path.join(__dirname,'../public/media');fs.mkdirSync(dir,{recursive:true});
  const name=crypto.randomUUID()+ext;fs.copyFileSync(source,path.join(dir,name),fs.constants.COPYFILE_EXCL);audio='/media/'+name;
 }
 if(!audio&&!link)throw new Error('Add --file, --audio-url or --link-url.');
 const language=options.language||existing?.language||null;
 if(existing)Object.assign(existing,{title,artist,type,language,audio_url:audio,link_url:link});
 else catalogue.tracks.push({id:Math.max(0,...catalogue.tracks.map(track=>track.id))+1,title,artist,type,language,mood:null,cover_url:null,audio_url:audio,link_url:link,duration:null,plays:0});
 fs.writeFileSync(catalogueFile,JSON.stringify(validateCatalogue(catalogue),null,2)+'\n');
 console.log('Saved: '+title+' by '+artist+'. Reload the app to see the updated static catalogue. Include public/media when deploying imported recordings.');
}catch(error){console.error(error.message);process.exitCode=1}
