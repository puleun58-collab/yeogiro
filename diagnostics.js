(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.YeogiroDiag=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const STORAGE_KEY='yeogiro-error-log',MAX_ENTRIES=20,DEDUPE_MS=60000;
const CATEGORIES=['network','sync','conflict','storage','api','weather','route','document-analysis','permission','pwa','unknown'];
const PREFIX_RULES=[[/^WEATHER_/,'weather'],[/^ROUTE_/,'route'],[/^SYNC_/,'sync'],[/^CONFLICT_/,'conflict'],[/^DOC_/,'document-analysis'],[/^PERMISSION_/,'permission'],[/^(SW|PWA)_/,'pwa'],[/^(STORAGE|IDB)_/,'storage'],[/^(NETWORK|OFFLINE)_/,'network'],[/^(API|HTTP)_/,'api']];
// Only these keys are ever persisted, so reservation numbers, tokens, memos and file
// contents can never reach the log even when a caller passes a raw error object.
const FIELDS=['code','category','area','screen','version'];
function code(value){const raw=String(value==null?'':value).toUpperCase().replace(/[^A-Z0-9_]/g,'_').replace(/^_+|_+$/g,'').slice(0,40);return raw||'UNKNOWN'}
function slug(value,fallback='unknown'){const raw=String(value==null?'':value).toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/^-+|-+$/g,'').slice(0,24);return raw||fallback}
function classify(errorCode,detail={}){
  if(detail.status===401||detail.status===403)return 'permission';
  if(detail.status===409)return 'conflict';
  if(detail.offline===true)return 'network';
  const normalized=code(errorCode);
  for(const [pattern,category] of PREFIX_RULES)if(pattern.test(normalized))return category;
  return CATEGORIES.includes(detail.category)?detail.category:'unknown';
}
function sanitize(entry={}){
  const normalized=code(entry.code),category=classify(normalized,entry);
  const clean={code:normalized,category,area:slug(entry.area,category),screen:slug(entry.screen,'app'),version:slug(entry.version,'unknown')};
  return FIELDS.reduce((out,key)=>(out[key]=clean[key],out),{});
}
function append(list,entry,{now=Date.now(),max=MAX_ENTRIES,window=DEDUPE_MS}={}){
  const clean=sanitize(entry),at=new Date(now).toISOString(),rows=Array.isArray(list)?list.filter(Boolean):[];
  const index=rows.findIndex(row=>row.code===clean.code&&row.area===clean.area&&row.screen===clean.screen);
  if(index>=0&&now-Date.parse(rows[index].lastAt||rows[index].at||0)<window){
    const merged={...rows[index],...clean,count:(Number(rows[index].count)||1)+1,lastAt:at};
    const next=rows.slice();next.splice(index,1);return [merged,...next].slice(0,max);
  }
  return [{...clean,at,lastAt:at,count:1},...rows].slice(0,max);
}
function summarize(list=[]){return (Array.isArray(list)?list:[]).map(row=>`${row.code}${Number(row.count)>1?` × ${row.count}`:''}`)}
function read(storage){
  try{const raw=storage?.getItem(STORAGE_KEY);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed.map(row=>({...sanitize(row),at:row.at||'',lastAt:row.lastAt||row.at||'',count:Number(row.count)||1})):[]}catch{return[]}
}
function write(storage,list){try{storage?.setItem(STORAGE_KEY,JSON.stringify(list))}catch{}}
function report(snapshot={}){
  const lines=[
    `앱 버전: ${snapshot.version||'알 수 없음'}`,
    `네트워크: ${snapshot.online?'온라인':'오프라인'}`,
    `동기화: ${snapshot.sync||'정보 없음'}`,
    `Service Worker: ${snapshot.serviceWorker||'정보 없음'}`,
    `저장소: ${snapshot.storage||'정보 없음'}`,
    `API: ${snapshot.api||'정보 없음'}`,
    `최근 오류: ${summarize(snapshot.errors).join(', ')||'없음'}`
  ];
  return lines.join('\n');
}
return{STORAGE_KEY,MAX_ENTRIES,DEDUPE_MS,CATEGORIES,classify,sanitize,append,summarize,read,write,report,
  record(entry,{storage=typeof localStorage==='undefined'?null:localStorage,now=Date.now()}={}){const next=append(read(storage),entry,{now});write(storage,next);return next},
  recent({storage=typeof localStorage==='undefined'?null:localStorage}={}){return read(storage)},
  clear({storage=typeof localStorage==='undefined'?null:localStorage}={}){write(storage,[]);return[]}};
});
