(function(){
'use strict';
const DB_NAME='yeogiro-cache-v2', DB_VERSION=1, STATE_KEY='app-state', MAX_HERO_SIZE=1536*1024;
let dbPromise, deviceId='', stateRef=null, remoteHandler=null, syncTimer=null, syncing=false;
const status={online:navigator.onLine,lastSync:'',pending:0,message:'준비 중',roleByTrip:{}};

function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('cache'))db.createObjectStore('cache');if(!db.objectStoreNames.contains('sessions'))db.createObjectStore('sessions',{keyPath:'tripId'});if(!db.objectStoreNames.contains('files'))db.createObjectStore('files',{keyPath:'id'});if(!db.objectStoreNames.contains('outbox'))db.createObjectStore('outbox',{keyPath:'tripId'});if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});return dbPromise
}
async function store(name,mode='readonly'){const db=await openDb();return db.transaction(name,mode).objectStore(name)}
async function get(name,key){const s=await store(name);return new Promise((r,j)=>{const q=s.get(key);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}
async function put(name,value,key){const s=await store(name,'readwrite');return new Promise((r,j)=>{const q=key===undefined?s.put(value):s.put(value,key);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}
async function del(name,key){const s=await store(name,'readwrite');return new Promise((r,j)=>{const q=s.delete(key);q.onsuccess=()=>r();q.onerror=()=>j(q.error)})}
async function all(name){const s=await store(name);return new Promise((r,j)=>{const q=s.getAll();q.onsuccess=()=>r(q.result||[]);q.onerror=()=>j(q.error)})}

function emit(){window.dispatchEvent(new CustomEvent('yeogiro:sync-status',{detail:{...status}}))}
function setStatus(message){status.online=navigator.onLine;status.message=message;emit()}
function dataUrlBlob(data){const [head,body]=String(data).split(','),mime=(head.match(/:(.*?);/)||[])[1]||'application/octet-stream',raw=atob(body),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:mime})}
function blobDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
function metaOf(id,blob,name,entityType,entityId){return{id,entityType,entityId,name,mime:blob.type||'application/octet-stream',size:blob.size,deviceId}}
async function saveBlob(blob,name,entityType,entityId,idValue){const id=idValue||`file_${crypto.randomUUID().replace(/-/g,'')}`,meta=metaOf(id,blob,name,entityType,entityId);await put('files',{...meta,blob});return meta}

async function migrateLegacy(state){
  let changed=false;
  for(const trip of state.trips||[]){
    trip.files=Array.isArray(trip.files)?trip.files:[];
    const legacyHero=typeof trip.heroData==='string'&&trip.heroData.startsWith('data:')?trip.heroData:trip.hero;if(typeof legacyHero==='string'&&legacyHero.startsWith('data:')){const meta=await saveBlob(dataUrlBlob(legacyHero),'여행 대표사진','trip',trip.id);trip.heroFileId=meta.id;trip.files.push(meta);trip.hero='';delete trip.heroData;changed=true}
    for(const item of trip.items||[]){const docs=[];for(const doc of item.userDocs||[]){if(doc&&typeof doc.data==='string'&&doc.data.startsWith('data:')){const meta=await saveBlob(dataUrlBlob(doc.data),doc.name||'예약 서류','item',item.id);docs.push(meta);trip.files.push(meta);changed=true}else if(doc&&doc.id)docs.push(doc)}item.userDocs=docs}
  }
  if(changed){await put('meta',{at:new Date().toISOString(),source:'localStorage',legacyRetained:true},'legacy-migration');await put('cache',state,STATE_KEY)}
  return state
}
async function initDevice(){deviceId=await get('meta','device-id');if(!deviceId){deviceId=`dev_${crypto.randomUUID().replace(/-/g,'')}`;await put('meta',deviceId,'device-id')}return deviceId}
function serverTrip(trip){const files=[];for(const item of trip.items||[])for(const doc of item.userDocs||[])if(doc.id)files.push({...doc,entityType:'item',entityId:item.id});for(const lodging of trip.lodgings||[])for(const doc of lodging.userDocs||[])if(doc.id)files.push({...doc,entityType:'lodging',entityId:lodging.id});if(trip.heroFileId){const hero=(trip.files||[]).find(x=>x.id===trip.heroFileId);if(hero)files.push({...hero,entityType:'trip',entityId:trip.id})}return{...trip,hero:'',files:[...new Map(files.map(x=>[x.id,x])).values()]}}
function mergeRemote(remote,local){
  const localFiles=new Map((local?.files||[]).map(x=>[x.id,x]));remote.files=(remote.files||[]).map(x=>({...x,local:Boolean(localFiles.has(x.id)&&x.deviceId===deviceId)}));
  for(const item of remote.items||[])item.userDocs=(item.userDocs||[]).map(x=>({...x,local:x.deviceId===deviceId}));
  for(const lodging of remote.lodgings||[])lodging.userDocs=(lodging.userDocs||[]).map(x=>({...x,local:x.deviceId===deviceId}));
  remote.hero='';return remote
}
async function request(path,options={},token=''){const headers=new Headers(options.headers||{});if(token)headers.set('Authorization',`Bearer ${token}`);if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');const response=await fetch(path,{...options,headers});let body=null;try{body=await response.json()}catch{}if(!response.ok){const error=new Error(body?.error||'서버 요청에 실패했습니다.');error.status=response.status;error.body=body;throw error}return body}
async function session(tripId){return get('sessions',tripId)}
async function cacheState(){if(stateRef)await put('cache',stateRef,STATE_KEY)}
async function syncHero(trip,s){if(!trip.heroFileId||!s||s.role==='viewer')return;const value=await get('files',trip.heroFileId);if(!value?.blob||value.uploadedFileId===trip.heroFileId)return;const form=new FormData;form.append('file',value.blob,'trip-cover.jpg');form.append('fileId',trip.heroFileId);const response=await fetch(`/api/trips/${encodeURIComponent(trip.id)}/hero`,{method:'PUT',headers:{Authorization:`Bearer ${s.token}`},body:form});let body=null;try{body=await response.json()}catch{}if(!response.ok)throw new Error(body?.error||'배경 사진을 공유하지 못했습니다.');value.uploadedFileId=trip.heroFileId;await put('files',value)}

async function pushTrip(trip){
  let s=await session(trip.id);
  if(!s){const result=await request('/api/trips',{method:'POST',body:JSON.stringify({trip:serverTrip(trip),displayName:'소유자'})});s={tripId:trip.id,token:result.accessToken,role:result.role,revision:result.trip.revision};await put('sessions',s);status.roleByTrip[trip.id]=s.role;await syncHero(trip,s);return result.trip}
  try{const result=await request(`/api/trips/${encodeURIComponent(trip.id)}`,{method:'PUT',body:JSON.stringify({trip:serverTrip(trip),baseRevision:s.revision||trip.revision||1})},s.token);s.revision=result.trip.revision;s.role=result.role;await put('sessions',s);status.roleByTrip[trip.id]=s.role;await syncHero(trip,s);return result.trip}
  catch(error){if(error.status===409&&error.body?.trip){window.dispatchEvent(new CustomEvent('yeogiro:conflict',{detail:{local:trip,remote:error.body.trip,tripId:trip.id}}));throw error}if(error.status===401){await del('sessions',trip.id);status.roleByTrip[trip.id]='';}throw error}
}
async function flush(){
  while(syncing)await new Promise(resolve=>setTimeout(resolve,80));if(!navigator.onLine||!stateRef)return;syncing=true;setStatus('동기화 중');
  try{const queued=await all('outbox');status.pending=queued.length;for(const job of queued){const local=stateRef.trips.find(x=>x.id===job.tripId);if(!local){await del('outbox',job.tripId);continue}const remote=await pushTrip(local),merged=mergeRemote(remote,local);const index=stateRef.trips.findIndex(x=>x.id===job.tripId);if(index>=0)stateRef.trips[index]=merged;await del('outbox',job.tripId)}status.pending=0;status.lastSync=new Date().toISOString();await put('meta',status.lastSync,'last-sync');await cacheState();setStatus('동기화됨');if(remoteHandler)remoteHandler(stateRef)}catch(error){setStatus(error.status===409?'동기화 충돌 확인 필요':'오프라인 저장됨')}finally{syncing=false}}
async function pullAll(){if(!navigator.onLine||!stateRef)return;let changed=false;for(const s of await all('sessions')){try{const result=await request(`/api/trips/${encodeURIComponent(s.tripId)}`,{},s.token);const index=stateRef.trips.findIndex(x=>x.id===s.tripId),local=index>=0?stateRef.trips[index]:null,merged=mergeRemote(result.trip,local);if(index>=0)stateRef.trips[index]=merged;else stateRef.trips.push(merged);s.revision=result.trip.revision;s.role=result.role;status.roleByTrip[s.tripId]=s.role;await put('sessions',s);changed=true}catch(error){if(error.status===401)await del('sessions',s.tripId)}}if(changed){status.lastSync=new Date().toISOString();await put('meta',status.lastSync,'last-sync');await cacheState();if(remoteHandler)remoteHandler(stateRef);setStatus('최신 상태')}}

async function bootstrap(legacy){
  await initDevice();status.lastSync=await get('meta','last-sync')||'';let cached=await get('cache',STATE_KEY);stateRef=await migrateLegacy(cached||legacy);await cacheState();
  const invite=new URLSearchParams(location.search).get('invite');if(invite){try{const result=await request('/api/invites/redeem',{method:'POST',body:JSON.stringify({token:invite,displayName:'동행자'})});await put('sessions',{tripId:result.tripId,token:result.accessToken,role:result.role,revision:result.trip.revision});const index=stateRef.trips.findIndex(x=>x.id===result.tripId);if(index>=0)stateRef.trips[index]=mergeRemote(result.trip,stateRef.trips[index]);else stateRef.trips.push(mergeRemote(result.trip,null));stateRef.activeId=result.tripId;history.replaceState({},'',location.pathname);await cacheState();setStatus('공유 여행 참여 완료')}catch(error){setStatus(error.message)}}
  for(const trip of stateRef.trips)if(!(await session(trip.id)))await put('outbox',{tripId:trip.id,updatedAt:Date.now()});
  status.pending=(await all('outbox')).length;emit();setTimeout(flush,50);setTimeout(pullAll,600);return stateRef
}
async function persist(state){
  stateRef=state;await cacheState();const live=new Set(state.trips.map(x=>x.id)),referenced=new Set();for(const trip of state.trips){for(const item of trip.items||[])for(const doc of item.userDocs||[])if(doc.id)referenced.add(doc.id);for(const lodging of trip.lodgings||[])for(const doc of lodging.userDocs||[])if(doc.id)referenced.add(doc.id);if(trip.heroFileId)referenced.add(trip.heroFileId);const s=await session(trip.id);if(s?.role!=='viewer')await put('outbox',{tripId:trip.id,updatedAt:Date.now()})}
  for(const file of await all('files'))if(!referenced.has(file.id))await del('files',file.id);
  for(const s of await all('sessions'))if(!live.has(s.tripId)){if(navigator.onLine&&s.role==='owner')request(`/api/trips/${encodeURIComponent(s.tripId)}`,{method:'DELETE'},s.token).catch(()=>{});await del('sessions',s.tripId);await del('outbox',s.tripId)}
  status.pending=(await all('outbox')).length;setStatus(navigator.onLine?'저장됨 · 동기화 대기':'오프라인 저장됨');clearTimeout(syncTimer);syncTimer=setTimeout(flush,450)
}
async function addFiles(files,entityType,entityId){const result=[];for(const file of files){if(!file.size)continue;if(file.size>25*1024*1024)throw new Error('파일은 25MB 이하만 저장할 수 있습니다.');result.push(await saveBlob(file,file.name,entityType,entityId))}return result}
async function fileUrl(fileId){const value=await get('files',fileId);return value?.blob?URL.createObjectURL(value.blob):''}
async function fileBlob(fileId){const value=await get('files',fileId);return value?.blob||null}
async function setHero(blob,tripId){if(!blob.size||blob.size>MAX_HERO_SIZE)throw new Error('공유 배경 사진은 1.5MB 이하여야 합니다.');const meta=await saveBlob(blob,'여행 대표사진','trip',tripId),s=await session(tripId);if(s)await syncHero({id:tripId,heroFileId:meta.id},s);return meta}
async function ensureHero(tripId,fileId){const s=await session(tripId);if(!s||s.role==='viewer')return;await syncHero({id:tripId,heroFileId:fileId},s)}
async function heroUrl(tripId,fileId){let value;try{value=await get('files',fileId)}catch{}if(value?.blob)return URL.createObjectURL(value.blob);if(!navigator.onLine)return'';const s=await session(tripId);if(!s)return'';let response;try{response=await fetch(`/api/trips/${encodeURIComponent(tripId)}/hero`,{headers:{Authorization:`Bearer ${s.token}`},cache:'no-store'})}catch{return''}if(!response.ok)return'';const blob=await response.blob();value={id:fileId,entityType:'trip',entityId:tripId,name:'여행 대표사진',mime:blob.type,size:blob.size,deviceId:'shared',blob,uploadedFileId:fileId};try{await put('files',value)}catch{}return URL.createObjectURL(blob)}
async function exportBackup(state){const copy=structuredClone(state);for(const trip of copy.trips||[])for(const item of trip.items||[])for(const doc of item.userDocs||[]){const value=await get('files',doc.id);if(value?.blob)doc.data=await blobDataUrl(value.blob)}for(const trip of copy.trips||[]){if(trip.heroFileId){const value=await get('files',trip.heroFileId);if(value?.blob)trip.heroData=await blobDataUrl(value.blob)}}return{format:'yeogiro-backup-v2',exportedAt:new Date().toISOString(),state:copy}}
async function importBackup(value){const incoming=value?.format==='yeogiro-backup-v2'?value.state:value;return migrateLegacy(incoming)}
async function share(role='editor'){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id);if(!s)throw new Error('먼저 여행 동기화를 완료해 주세요.');const result=await request(`/api/trips/${encodeURIComponent(t.id)}/invites`,{method:'POST',body:JSON.stringify({role,expiresInDays:7})},s.token);return `${location.origin}${location.pathname}?invite=${encodeURIComponent(result.token)}`}
async function access(){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id);if(!s)throw new Error('동기화 정보가 없습니다.');return request(`/api/trips/${encodeURIComponent(t.id)}/access`,{},s.token)}
async function revoke(kind,idValue){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id);return request(`/api/trips/${encodeURIComponent(t.id)}/${kind}/${encodeURIComponent(idValue)}`,{method:'DELETE'},s.token)}
function onRemote(handler){remoteHandler=handler}
function useRemote(tripId,remote){const index=stateRef.trips.findIndex(x=>x.id===tripId);if(index>=0)stateRef.trips[index]=mergeRemote(remote,stateRef.trips[index]);del('outbox',tripId);cacheState();if(remoteHandler)remoteHandler(stateRef)}

addEventListener('online',()=>{setStatus('온라인 · 동기화 중');flush();pullAll()});addEventListener('offline',()=>setStatus('오프라인'));
window.YeogiroStore={bootstrap,persist,addFiles,fileUrl,fileBlob,setHero,ensureHero,heroUrl,exportBackup,importBackup,share,access,revoke,onRemote,useRemote,pull:pullAll,flush,status:()=>({...status}),device:()=>deviceId};
})();
