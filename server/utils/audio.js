const BASE='https://download.quranicaudio.com/quran';
function audioUrl(reciter,id){
 const roots={
  maher_almuaiqly:'https://server12.mp3quran.net/maher',
  'sa3d_al-ghaamidi':BASE+'/sa3d_al-ghaamidi/complete',
  'abu_bakr_ash-shatri':BASE+'/abu_bakr_ash-shaatree'
 };
 if(!reciter || reciter.slug==='omar_hisham_al_arabi')return null;
 return (roots[reciter.slug]||BASE+'/'+reciter.slug)+'/'+String(id).padStart(3,'0')+'.mp3';
}
const externalLink=(title)=>'https://www.youtube.com/results?search_query='+encodeURIComponent(title);
const describeReciter=r=>({...r,audio_available:!!audioUrl(r,1),audio_base_url:audioUrl(r,1)?.replace(/001\.mp3$/,'' )||null,link_url:externalLink(r.name+' Quran')});
module.exports={audioUrl,externalLink,describeReciter};
