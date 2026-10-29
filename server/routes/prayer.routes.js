const router=require('express').Router();
const cache=new Map();
router.get('/',async(req,res)=>{
 const {city,country}=req.query,method=Number(req.query.method||3);
 if(typeof city!=='string'||!city.trim()||city.length>100||typeof country!=='string'||!country.trim()||country.length>100||![1,2,3,4,5,7,8,9,10,11,12,13,14,15,16].includes(method))return res.status(400).json({error:'Enter a city, country and valid calculation method.'});
 const now=new Date(), date=[now.getUTCDate(),now.getUTCMonth()+1,now.getUTCFullYear()].join('-');
 const key=JSON.stringify([city,country,method,date]);
 const localDate=zone=>new Intl.DateTimeFormat('en-GB',{timeZone:zone,day:'2-digit',month:'2-digit',year:'numeric'}).format(now).replaceAll('/','-');
 const cached=cache.get(key);
 if(cached&&cached.date.gregorian.date===localDate(cached.timezone))return res.json(cached);
 try {
  const params=new URLSearchParams({city,country,method:String(method)});
  const response=await fetch('https://api.aladhan.com/v1/timingsByCity/'+date+'?'+params,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error();
  let {data}=await response.json();
  if(!data?.timings||!data?.meta?.timezone)throw new Error();
  const locationDate=localDate(data.meta.timezone);
  if(data.date.gregorian.date!==locationDate){
   const corrected=await fetch('https://api.aladhan.com/v1/timingsByCity/'+locationDate+'?'+params,{signal:AbortSignal.timeout(12000)});
   if(!corrected.ok)throw new Error();
   data=(await corrected.json()).data;
   if(!data?.timings||!data?.meta?.timezone)throw new Error();
  }
  const result={city,country,timings:data.timings,timezone:data.meta.timezone,date:data.date,method:data.meta.method.name,source:'AlAdhan'};
  if(cache.size>200)cache.clear();
  cache.set(key,result);res.json(result);
 }catch{res.status(502).json({error:'Prayer times are unavailable. Check your city and internet connection, then try again.'});}
});
module.exports=router;
