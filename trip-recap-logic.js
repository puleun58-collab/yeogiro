(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.YeogiroRecap=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

function phaseOf(trip,today){if(today<trip.start)return'before';if(today>trip.end)return'after';return'during'}

function groupTrips(trips=[],today){
  const withPhase=trips.map(t=>({trip:t,phase:phaseOf(t,today)}));
  const ongoing=withPhase.filter(x=>x.phase==='during').map(x=>x.trip);
  const upcoming=withPhase.filter(x=>x.phase==='before').map(x=>x.trip).sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title));
  const past=withPhase.filter(x=>x.phase==='after').map(x=>x.trip).sort((a,b)=>b.end.localeCompare(a.end)||a.title.localeCompare(b.title));
  return{ongoing,upcoming,past};
}

function placeKey(item){return String(item.place||item.name||'').trim()}

function visitedPlaces(items=[]){
  const located=items.filter(i=>Number.isFinite(i.lat)&&Number.isFinite(i.lng));
  const order=[],counts=new Map();
  for(const item of located){
    const key=placeKey(item);if(!key)continue;
    if(!counts.has(key)){counts.set(key,0);order.push(key)}
    counts.set(key,counts.get(key)+1);
  }
  return order.map(label=>({label,count:counts.get(label)}));
}

function dayGroups(items=[],start,end){
  const range=[];let cursor=new Date(start+'T00:00:00');const stop=new Date(end+'T00:00:00');
  while(cursor<=stop){const y=cursor.getFullYear(),m=String(cursor.getMonth()+1).padStart(2,'0'),d=String(cursor.getDate()).padStart(2,'0');range.push(`${y}-${m}-${d}`);cursor.setDate(cursor.getDate()+1)}
  return range.map((day,index)=>({day,dayNo:index+1,items:items.filter(i=>i.day===day).sort((a,b)=>String(a.time||'').localeCompare(String(b.time||'')))}));
}

function haversineKm(a,b){
  if(![a?.lat,a?.lng,b?.lat,b?.lng].every(Number.isFinite))return null;
  const radius=6371,rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLng=(b.lng-a.lng)*rad;
  const value=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
  return 2*radius*Math.asin(Math.sqrt(value));
}

function distanceSummary(items=[]){
  const byDay=new Map();
  for(const item of items){if(!item.day)continue;if(!byDay.has(item.day))byDay.set(item.day,[]);byDay.get(item.day).push(item)}
  let totalKm=0,pairs=0,skipped=0;
  for(const list of byDay.values()){
    const sorted=[...list].sort((a,b)=>String(a.time||'').localeCompare(String(b.time||'')));
    for(let index=0;index<sorted.length-1;index++){
      const distance=haversineKm(sorted[index],sorted[index+1]);
      if(distance===null){skipped+=1;continue}
      totalKm+=distance;pairs+=1;
    }
  }
  if(!pairs)return null;
  return{km:totalKm,partial:skipped>0};
}

function flightsSummary(flights=[]){
  return(flights||[]).map(f=>({id:f.id,label:f.flightNumber||f.airline||'항공편',route:[f.from,f.to].filter(Boolean).join(' → ')}));
}

function lodgingsSummary(lodgings=[]){
  return(lodgings||[]).map(l=>{
    const inDate=new Date(String(l.checkInDate||'')+'T00:00:00'),outDate=new Date(String(l.checkOutDate||'')+'T00:00:00');
    const nights=Number.isFinite(+inDate)&&Number.isFinite(+outDate)?Math.max(0,Math.round((outDate-inDate)/86400000)):0;
    return{id:l.id,name:l.name||'숙소',nights};
  });
}

function settlementBadge({transfersCount=0,settledAt='',fingerprint='',storedFingerprint=''}={}){
  if(!transfersCount)return null;
  if(settledAt&&fingerprint===storedFingerprint)return'settled';
  return'unsettled';
}

function participantsLabel(members=[]){
  const generic=new Set(['나','이전 참여자','']);
  const named=(members||[]).filter(m=>m&&m.name&&!generic.has(m.name));
  if(!members.length||members.length<=1)return'';
  if(named.length)return`${named[0].name} 외 ${members.length-1}명`;
  return`${members.length}명 여행`;
}

const STRIP_FLIGHT_FIELDS=['reservationNumber','seat','baggage'];
const STRIP_LODGING_FIELDS=['reservationNumber'];
const STRIP_ITEM_FIELDS=['reservationNumber','provider','userDocs'];

function duplicateTrip({source,newId,newTitle,newStart,newEnd,idFactory,includeItinerary=true,includeChecklist=false}){
  const oldStart=new Date(source.start+'T00:00:00'),newStartDate=new Date(newStart+'T00:00:00'),newEndDate=new Date(newEnd+'T00:00:00');
  const next={id:newId,title:newTitle,start:newStart,end:newEnd,note:'',cities:[...(source.cities||[])],flights:[],lodgings:[],items:[],expenses:[],expenseSettings:{baseCurrency:source.expenseSettings?.baseCurrency||'KRW',budgetMinor:null,settledAt:'',settlementFingerprint:''},files:[],hero:'',checklist:[]};
  let skipped=0;
  if(includeItinerary){
    for(const item of source.items||[]){
      const itemDate=new Date(String(item.day||source.start)+'T00:00:00');
      const offsetDays=Math.round((itemDate-oldStart)/86400000);
      const targetDate=new Date(newStartDate);targetDate.setDate(targetDate.getDate()+offsetDays);
      if(targetDate>newEndDate){skipped+=1;continue}
      const y=targetDate.getFullYear(),m=String(targetDate.getMonth()+1).padStart(2,'0'),d=String(targetDate.getDate()).padStart(2,'0');
      const clone={...item};
      for(const field of STRIP_ITEM_FIELDS)clone[field]=field==='userDocs'?[]:'';
      clone.id=idFactory();
      clone.day=`${y}-${m}-${d}`;
      next.items.push(clone);
    }
  }
  if(includeChecklist){
    for(const check of source.checklist||[]){
      next.checklist.push({id:idFactory(),title:check.title,scope:check.scope==='shared'?'shared':'personal',assigneeMemberId:'',completed:false,sortOrder:next.checklist.length,important:Boolean(check.important)});
    }
  }
  return{trip:next,skippedItems:skipped};
}

return{phaseOf,groupTrips,visitedPlaces,dayGroups,distanceSummary,flightsSummary,lodgingsSummary,settlementBadge,participantsLabel,duplicateTrip,STRIP_FLIGHT_FIELDS,STRIP_LODGING_FIELDS,STRIP_ITEM_FIELDS};
});
