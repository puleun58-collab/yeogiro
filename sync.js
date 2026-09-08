(function(){
'use strict';
const DB_NAME='yeogiro-cache-v2', DB_VERSION=1, STATE_KEY='app-state', MAX_HERO_SIZE=1536*1024;
let dbPromise, deviceId='', stateRef=null, remoteHandler=null, syncTimer=null, syncing=false;
const syncedFingerprints=new Map;
const status={online:navigator.onLine,lastSync:'',lastSyncError:'',lastSyncErrorCode:'',pending:0,message:'준비 중',phase:'idle',conflict:null,roleByTrip:{},memberByTrip:{},recoverTripId:'',deviceLinkTripId:'',deviceLinkToken:'',account:null,accountSession:null,claimableTripIds:[],pendingInvite:'',authJustCompleted:false,authError:''};

function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('cache'))db.createObjectStore('cache');if(!db.objectStoreNames.contains('sessions'))db.createObjectStore('sessions',{keyPath:'tripId'});if(!db.objectStoreNames.contains('files'))db.createObjectStore('files',{keyPath:'id'});if(!db.objectStoreNames.contains('outbox'))db.createObjectStore('outbox',{keyPath:'tripId'});if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});return dbPromise
}
async function store(name,mode='readonly'){const db=await openDb();return db.transaction(name,mode).objectStore(name)}
async function get(name,key){const s=await store(name);return new Promise((r,j)=>{const q=s.get(key);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}
async function put(name,value,key){const s=await store(name,'readwrite');return new Promise((r,j)=>{const q=key===undefined?s.put(value):s.put(value,key);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}
async function del(name,key){const s=await store(name,'readwrite');return new Promise((r,j)=>{const q=s.delete(key);q.onsuccess=()=>r();q.onerror=()=>j(q.error)})}
async function all(name){const s=await store(name);return new Promise((r,j)=>{const q=s.getAll();q.onsuccess=()=>r(q.result||[]);q.onerror=()=>j(q.error)})}
async function clearStore(name){const s=await store(name,'readwrite');return new Promise((r,j)=>{const q=s.clear();q.onsuccess=()=>r();q.onerror=()=>j(q.error)})}

function emit(){window.dispatchEvent(new CustomEvent('yeogiro:sync-status',{detail:{...status}}))}
function setStatus(message,phase){status.online=navigator.onLine;status.message=message;if(phase)status.phase=phase;emit()}
function dataUrlBlob(data){const [head,body]=String(data).split(','),mime=(head.match(/:(.*?);/)||[])[1]||'application/octet-stream',raw=atob(body),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:mime})}
function blobDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
function metaOf(id,blob,name,entityType,entityId){return{id,entityType,entityId,name,mime:blob.type||'application/octet-stream',size:blob.size,deviceId}}
function deviceInfo(){const ua=navigator.userAgent||'',standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,platform=/iPhone|iPad|iPod/.test(ua)?'iOS':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Macintosh|Mac OS/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'플랫폼 정보 없음',browser=/Edg\//.test(ua)?'Edge':/CriOS|Chrome\//.test(ua)?'Chrome':/FxiOS|Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'브라우저';return{deviceId,deviceName:`${platform} · ${standalone?'앱':browser}`,platform,clientType:standalone?'pwa':'browser'}}
async function saveBlob(blob,name,entityType,entityId,idValue){const id=idValue||`file_${crypto.randomUUID().replace(/-/g,'')}`,meta=metaOf(id,blob,name,entityType,entityId);await put('files',{...meta,blob});return meta}

async function migrateLegacy(state){
  let changed=false;
  for(const trip of state.trips||[]){
    trip.files=Array.isArray(trip.files)?trip.files:[];
    trip.items=Array.isArray(trip.items)?trip.items:[];trip.flights=Array.isArray(trip.flights)?trip.flights:[];trip.lodgings=Array.isArray(trip.lodgings)?trip.lodgings:[];
    if(!Array.isArray(trip.checklist)){trip.checklist=[];changed=true}
    if(!Array.isArray(trip.expenses)){trip.expenses=[];changed=true}
    if(!trip.expenseSettings||typeof trip.expenseSettings!=='object'){trip.expenseSettings={baseCurrency:'KRW',budgetMinor:null,settledAt:'',settlementFingerprint:''};changed=true}
    for(const item of trip.items){item.userDocs=Array.isArray(item.userDocs)?item.userDocs:[];item.reservationNumber=String(item.reservationNumber||'');item.provider=String(item.provider||'');if(typeof item.fixed!=='boolean'){item.fixed=false;changed=true}if(!Number.isInteger(item.moveMinutes)||item.moveMinutes<1||item.moveMinutes>1440)item.moveMinutes=null}
    for(const flight of trip.flights){flight.departDate=flight.departDate||trip.start;flight.arriveDate=flight.arriveDate||flight.departDate;flight.userDocs=Array.isArray(flight.userDocs)?flight.userDocs:[]}
    for(const lodging of trip.lodgings){lodging.checkInDate=lodging.checkInDate||trip.start;lodging.checkInTime=lodging.checkInTime||'15:00';lodging.checkOutDate=lodging.checkOutDate||trip.end;lodging.checkOutTime=lodging.checkOutTime||'11:00';lodging.userDocs=Array.isArray(lodging.userDocs)?lodging.userDocs:[]}
    const oldHeroId=trip.heroFileId,legacyHero=typeof trip.heroData==='string'&&trip.heroData.startsWith('data:')?trip.heroData:trip.hero;if(typeof legacyHero==='string'&&legacyHero.startsWith('data:')){const meta=await saveBlob(dataUrlBlob(legacyHero),'여행 대표사진','trip',trip.id);trip.heroFileId=meta.id;trip.files=trip.files.filter(x=>x.id!==oldHeroId);trip.files.push(meta);trip.hero='';delete trip.heroData;changed=true}
    for(const [type,entities] of [['item',trip.items||[]],['flight',trip.flights||[]],['lodging',trip.lodgings||[]]])for(const entity of entities){const docs=[];for(const doc of entity.userDocs||[]){if(doc&&typeof doc.data==='string'&&doc.data.startsWith('data:')){const meta=await saveBlob(dataUrlBlob(doc.data),doc.name||'예약 서류',type,entity.id,doc.id);docs.push(meta);trip.files.push(meta);delete doc.data;changed=true}else if(doc&&doc.id)docs.push(doc)}entity.userDocs=docs}
    for(const file of trip.files||[])if(file&&typeof file.data==='string'&&file.data.startsWith('data:')){await saveBlob(dataUrlBlob(file.data),file.name||'예약 서류',file.entityType||'trip',file.entityId||trip.id,file.id);delete file.data;changed=true}
  }
  if(changed){await put('meta',{at:new Date().toISOString(),source:'localStorage',legacyRetained:true},'legacy-migration');await put('cache',state,STATE_KEY)}
  return state
}
async function initDevice(){deviceId=await get('meta','device-id');if(!deviceId){deviceId=`dev_${crypto.randomUUID().replace(/-/g,'')}`;await put('meta',deviceId,'device-id')}return deviceId}
function serverTrip(trip){const files=[];for(const [type,entities] of [['item',trip.items||[]],['flight',trip.flights||[]],['lodging',trip.lodgings||[]]])for(const entity of entities)for(const doc of entity.userDocs||[])if(doc.id)files.push({...doc,entityType:type,entityId:entity.id});for(const file of trip.files||[])if(file.id&&file.entityType==='trip')files.push({...file,entityId:trip.id});if(trip.heroFileId){const hero=(trip.files||[]).find(x=>x.id===trip.heroFileId);if(hero)files.push({...hero,entityType:'trip',entityId:trip.id})}const result={...trip,hero:'',files:[...new Map(files.map(x=>[x.id,x])).values()]};delete result.expenseMembers;return result}
function tripFingerprint(trip){const copy=serverTrip(trip);delete copy.revision;delete copy.heroSharedData;return JSON.stringify(copy)}
function markSynced(trip){if(trip?.id)syncedFingerprints.set(trip.id,tripFingerprint(trip))}
function mergeRemote(remote,local){
  const localFiles=new Map((local?.files||[]).map(x=>[x.id,x]));remote.files=(remote.files||[]).map(x=>({...x,local:Boolean(localFiles.has(x.id)&&x.deviceId===deviceId)}));
  for(const item of remote.items||[])item.userDocs=(item.userDocs||[]).map(x=>({...x,local:x.deviceId===deviceId}));
  for(const flight of remote.flights||[])flight.userDocs=(flight.userDocs||[]).map(x=>({...x,local:x.deviceId===deviceId}));
  for(const lodging of remote.lodgings||[])lodging.userDocs=(lodging.userDocs||[]).map(x=>({...x,local:x.deviceId===deviceId}));
  remote.hero='';return remote
}
async function request(path,options={},token=''){const headers=new Headers(options.headers||{});if(token)headers.set('Authorization',`Bearer ${token}`);if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');const response=await fetch(path,{credentials:'same-origin',...options,headers});let body=null;try{body=await response.json()}catch{}if(!response.ok){const error=new Error(body?.error||'서버 요청에 실패했습니다.');error.status=response.status;error.body=body;throw error}return body}
async function session(tripId){return get('sessions',tripId)}
async function cacheState(){if(stateRef)await put('cache',stateRef,STATE_KEY)}
function emptyStarterTrip(value){return value&&!value.revision&&value.title==='새 여행'&&!value.note&&!(value.cities||[]).length&&!(value.items||[]).length&&!(value.flights||[]).length&&!(value.lodgings||[]).length&&!(value.expenses||[]).length&&!value.heroFileId}
async function mergeAccountTrips(entries){
  const linked=new Set(entries.map(x=>x.trip.id)),queued=new Set((await all('outbox')).map(x=>x.tripId));
  if(entries.length&&stateRef.trips.length===1&&emptyStarterTrip(stateRef.trips[0]))stateRef.trips=[];
  for(const entry of entries){
    const index=stateRef.trips.findIndex(x=>x.id===entry.trip.id),local=index>=0?stateRef.trips[index]:null,preserveLocal=Boolean(local&&queued.has(entry.trip.id)),merged=preserveLocal?local:mergeRemote(entry.trip,local);
    if(index>=0)stateRef.trips[index]=merged;else stateRef.trips.push(merged);
    const saved=await session(entry.trip.id);await put('sessions',{...(saved||{}),tripId:entry.trip.id,token:saved?.token||'',auth:saved?.token?'legacy':'account',accountLinked:true,sessionId:saved?.sessionId||status.accountSession?.id||'',memberId:entry.memberId,role:entry.role,revision:entry.trip.revision});
    status.roleByTrip[entry.trip.id]=entry.role;status.memberByTrip[entry.trip.id]=entry.memberId;if(!preserveLocal)markSynced(merged);
  }
  if(entries.length&&!stateRef.trips.some(x=>x.id===stateRef.activeId))stateRef.activeId=entries[0].trip.id;
  const localSessions=await all('sessions');status.claimableTripIds=localSessions.filter(x=>x.token&&!linked.has(x.tripId)).map(x=>x.tripId);
  await cacheState();if(remoteHandler)remoteHandler(stateRef);
}
async function redeemPendingInvite(){
  const token=status.pendingInvite;if(!token||!status.account)return null;
  const result=await request('/api/invites/redeem',{method:'POST',body:JSON.stringify({token,...deviceInfo()})}),saved=await session(result.tripId);
  await put('sessions',{...(saved||{}),tripId:result.tripId,token:result.accessToken||saved?.token||'',auth:result.accessToken?'legacy':'account',accountLinked:true,sessionId:result.sessionId||status.accountSession?.id||'',memberId:result.memberId,role:result.role,revision:result.trip.revision});
  status.roleByTrip[result.tripId]=result.role;status.memberByTrip[result.tripId]=result.memberId;const index=stateRef.trips.findIndex(x=>x.id===result.tripId),merged=mergeRemote(result.trip,index>=0?stateRef.trips[index]:null);if(index>=0)stateRef.trips[index]=merged;else stateRef.trips.push(merged);stateRef.activeId=result.tripId;markSynced(merged);status.pendingInvite='';try{sessionStorage.removeItem('yeogiro-pending-invite')}catch{}history.replaceState({},'',location.pathname);await cacheState();if(remoteHandler)remoteHandler(stateRef);setStatus('초대받은 여행에 참여했습니다.','idle');return result
}
async function refreshAccount(){
  if(!navigator.onLine)return null;
  try{
    const result=await request('/api/auth/me');status.account=result.account;status.accountSession=result.session;status.authError='';
    const trips=await request('/api/auth/trips');await mergeAccountTrips(trips.trips||[]);if(status.pendingInvite)await redeemPendingInvite();emit();return result.account
  }catch(error){
    if(error.status===401){status.account=null;status.accountSession=null;status.claimableTripIds=[]}else status.authError=error.message||'계정 정보를 불러오지 못했습니다.';
    emit();return null
  }
}
async function googleLogin(returnTo='/'){const config=await request('/api/auth/config');if(!config.googleEnabled)throw new Error('Google 로그인을 사용하려면 운영 설정이 필요합니다.');const info=deviceInfo(),url=new URL('/api/auth/google/start',location.origin);url.searchParams.set('return_to',returnTo);url.searchParams.set('policy',config.policyVersion);for(const[key,value]of Object.entries(info))url.searchParams.set(key,value);location.assign(url.href)}
async function claimTrips(){
  if(!status.account)throw new Error('먼저 로그인해 주세요.');
  const claimed=[],conflicts=[];for(const saved of await all('sessions')){if(!saved.token)continue;try{await request(`/api/auth/trips/${encodeURIComponent(saved.tripId)}/claim`,{method:'POST',body:'{}'},saved.token);claimed.push(saved.tripId)}catch(error){if(error.status===409)conflicts.push({tripId:saved.tripId,message:error.message});else throw error}}
  await refreshAccount();return{claimed,conflicts}
}
async function logoutAccount(){await request('/api/auth/logout',{method:'POST'});status.account=null;status.accountSession=null;status.claimableTripIds=[];for(const saved of await all('sessions'))if(!saved.token)await del('sessions',saved.tripId);emit()}
async function authSessions(){return request('/api/auth/sessions')}
async function renameAuthSession(sessionId,deviceName){return request(`/api/auth/sessions/${encodeURIComponent(sessionId)}`,{method:'PATCH',body:JSON.stringify({deviceName:String(deviceName||'').trim().slice(0,40)})})}
async function revokeAuthSession(sessionId){const result=await request(`/api/auth/sessions/${encodeURIComponent(sessionId)}`,{method:'DELETE'});if(result.current){status.account=null;status.accountSession=null;status.claimableTripIds=[]}emit();return result}
async function revokeOtherAuthSessions(){return request('/api/auth/sessions?others=1',{method:'DELETE'})}
async function accountDeletion(){return request('/api/auth/account')}
async function deleteAccount(){await request('/api/auth/account',{method:'DELETE'});status.account=null;status.accountSession=null;status.claimableTripIds=[];for(const saved of await all('sessions'))await del('sessions',saved.tripId);emit()}
async function syncHero(trip,s){if(!trip.heroFileId||!s||s.role==='viewer')return;const value=await get('files',trip.heroFileId);if(!value?.blob||value.uploadedFileId===trip.heroFileId)return;const form=new FormData,headers=new Headers;if(s.token)headers.set('Authorization',`Bearer ${s.token}`);form.append('file',value.blob,'trip-cover.jpg');form.append('fileId',trip.heroFileId);const response=await fetch(`/api/trips/${encodeURIComponent(trip.id)}/hero`,{method:'PUT',credentials:'same-origin',headers,body:form});let body=null;try{body=await response.json()}catch{}if(!response.ok)throw new Error(body?.error||'배경 사진을 공유하지 못했습니다.');value.uploadedFileId=trip.heroFileId;await put('files',value)}

async function pushTrip(trip){
  let s=await session(trip.id);
  if(!s){
    const result=await request('/api/trips',{method:'POST',body:JSON.stringify({trip:serverTrip(trip),displayName:'나',...deviceInfo()})});
    s={tripId:trip.id,token:result.accessToken,sessionId:result.sessionId,memberId:result.memberId,role:result.role,revision:result.trip.revision};
    await put('sessions',s);status.roleByTrip[trip.id]=s.role;status.memberByTrip[trip.id]=s.memberId;await syncHero(trip,s);return result.trip
  }
  try{
    const result=await request(`/api/trips/${encodeURIComponent(trip.id)}`,{method:'PUT',body:JSON.stringify({trip:serverTrip(trip),baseRevision:s.revision||trip.revision||1})},s.token);
    s.revision=result.trip.revision;s.role=result.role;s.memberId=result.memberId||s.memberId;await put('sessions',s);status.roleByTrip[trip.id]=s.role;status.memberByTrip[trip.id]=s.memberId;await syncHero(trip,s);return result.trip
  }catch(error){
    if(error.status===409&&error.body?.trip){
      const remote=mergeRemote(structuredClone(error.body.trip),trip);
      if(tripFingerprint(remote)===tripFingerprint(trip)){
        s.revision=remote.revision;await put('sessions',s);return remote
      }
      status.conflict={local:structuredClone(trip),remote:error.body.trip,tripId:trip.id,changes:error.body.changes||[]};setStatus('동기화 확인 필요','conflict');window.dispatchEvent(new CustomEvent('yeogiro:conflict',{detail:status.conflict}));throw error
    }
    if(error.status===401){await del('sessions',trip.id);await del('outbox',trip.id);status.roleByTrip[trip.id]=''}
    throw error
  }
}
async function flush(){
  while(syncing)await new Promise(resolve=>setTimeout(resolve,80));if(!navigator.onLine||!stateRef||status.conflict)return;syncing=true;setStatus('동기화 중','syncing');
  try{const queued=await all('outbox');status.pending=queued.length;for(const job of queued){const local=stateRef.trips.find(x=>x.id===job.tripId);if(!local){await del('outbox',job.tripId);continue}const remote=await pushTrip(local),merged=mergeRemote(remote,local);const index=stateRef.trips.findIndex(x=>x.id===job.tripId);if(index>=0)stateRef.trips[index]=merged;markSynced(merged);await del('outbox',job.tripId);status.pending=Math.max(0,status.pending-1);emit()}status.pending=0;status.lastSync=new Date().toISOString();await put('meta',status.lastSync,'last-sync');await cacheState();setStatus('모든 변경사항이 저장되었습니다.','idle');if(remoteHandler)remoteHandler(stateRef)}catch(error){status.lastSyncError=new Date().toISOString();status.lastSyncErrorCode='SYNC_PUSH_'+(error.status||'FAILED');if(error.status!==409)setStatus('변경사항이 이 기기에 안전하게 저장되어 있습니다.',navigator.onLine?'pending':'offline')}finally{syncing=false}}
async function pullAll(){if(!navigator.onLine||!stateRef||status.conflict)return;const queued=new Set((await all('outbox')).map(x=>x.tripId));let changed=false;for(const s of await all('sessions')){if(queued.has(s.tripId))continue;try{const result=await request(`/api/trips/${encodeURIComponent(s.tripId)}`,{},s.token);const index=stateRef.trips.findIndex(x=>x.id===s.tripId),local=index>=0?stateRef.trips[index]:null,merged=mergeRemote(result.trip,local);if(index>=0)stateRef.trips[index]=merged;else stateRef.trips.push(merged);markSynced(merged);s.revision=result.trip.revision;s.role=result.role;s.memberId=result.memberId||s.memberId;status.roleByTrip[s.tripId]=s.role;status.memberByTrip[s.tripId]=s.memberId;await put('sessions',s);changed=true}catch(error){status.lastSyncError=new Date().toISOString();status.lastSyncErrorCode='SYNC_PULL_'+(error.status||'FAILED');if(error.status===401)await del('sessions',s.tripId)}}if(changed){status.lastSync=new Date().toISOString();await put('meta',status.lastSync,'last-sync');await cacheState();if(remoteHandler)remoteHandler(stateRef);setStatus('모든 변경사항이 저장되었습니다.','idle')}}

async function bootstrap(legacy){
  await initDevice();status.lastSync=await get('meta','last-sync')||'';let cached=await get('cache',STATE_KEY);stateRef=await migrateLegacy(cached||legacy);await cacheState();
  for(const savedSession of await all('sessions')){status.roleByTrip[savedSession.tripId]=savedSession.role;status.memberByTrip[savedSession.tripId]=savedSession.memberId||'';const local=stateRef.trips.find(x=>x.id===savedSession.tripId);if(local)markSynced(local)}
  const params=new URLSearchParams(location.search),hashParams=new URLSearchParams(location.hash.replace(/^#/,'')),invite=params.get('invite')||hashParams.get('invite')||(()=>{try{return sessionStorage.getItem('yeogiro-pending-invite')||''}catch{return''}})();
  status.recoverTripId=cleanTripId(params.get('trip')||'');status.deviceLinkTripId=cleanTripId(params.get('connect')||'');status.deviceLinkToken=cleanConnectToken(params.get('connect_token')||hashParams.get('connect_token')||'');status.pendingInvite=cleanConnectToken(invite);status.authJustCompleted=params.get('auth')==='success';
  if(status.pendingInvite)try{sessionStorage.setItem('yeogiro-pending-invite',status.pendingInvite)}catch{}
  for(const trip of stateRef.trips)if(!(await session(trip.id))){if(!trip.revision&&!emptyStarterTrip(trip))await put('outbox',{tripId:trip.id,updatedAt:Date.now()});else await del('outbox',trip.id)}
  status.pending=(await all('outbox')).length;status.phase=navigator.onLine?(status.pending?'pending':'idle'):'offline';emit();
  if(navigator.onLine)await refreshAccount();
  setTimeout(flush,50);setTimeout(pullAll,600);return stateRef
}
async function persist(state){
  stateRef=state;await cacheState();const live=new Set(state.trips.map(x=>x.id)),referenced=new Set();for(const trip of state.trips){for(const entity of [...(trip.items||[]),...(trip.flights||[]),...(trip.lodgings||[])])for(const doc of entity.userDocs||[])if(doc.id)referenced.add(doc.id);for(const file of trip.files||[])if(file.id&&file.entityType==='trip')referenced.add(file.id);if(trip.heroFileId)referenced.add(trip.heroFileId);const s=await session(trip.id),changed=syncedFingerprints.get(trip.id)!==tripFingerprint(trip);if(s?s.role!=='viewer'&&changed:!trip.revision&&!emptyStarterTrip(trip))await put('outbox',{tripId:trip.id,updatedAt:Date.now()});else if(!s)await del('outbox',trip.id)}
  for(const file of await all('files'))if(!referenced.has(file.id))await del('files',file.id);
  for(const s of await all('sessions'))if(!live.has(s.tripId)){if(navigator.onLine&&s.role==='owner')request(`/api/trips/${encodeURIComponent(s.tripId)}`,{method:'DELETE'},s.token).catch(()=>{});await del('sessions',s.tripId);await del('outbox',s.tripId)}
  status.pending=(await all('outbox')).length;setStatus(navigator.onLine?(status.pending?'변경사항이 동기화를 기다리고 있습니다.':'모든 변경사항이 저장되었습니다.'):'변경사항이 이 기기에 안전하게 저장되어 있습니다.',navigator.onLine?(status.pending?'pending':'idle'):'offline');clearTimeout(syncTimer);syncTimer=setTimeout(flush,450)
}
async function addFiles(files,entityType,entityId){const result=[];for(const file of files){if(!file.size)continue;if(file.size>25*1024*1024)throw new Error('파일은 25MB 이하만 저장할 수 있습니다.');result.push(await saveBlob(file,file.name,entityType,entityId))}return result}
async function fileUrl(fileId){const value=await get('files',fileId);return value?.blob?URL.createObjectURL(value.blob):''}
async function fileBlob(fileId){const value=await get('files',fileId);return value?.blob||null}
async function hasFile(fileId){const value=await get('files',fileId);return Boolean(value?.blob)}
async function setHero(blob,tripId){if(!blob.size||blob.size>MAX_HERO_SIZE)throw new Error('공유 배경 사진은 1.5MB 이하여야 합니다.');const meta=await saveBlob(blob,'여행 대표사진','trip',tripId),s=await session(tripId);if(s)await syncHero({id:tripId,heroFileId:meta.id},s);return meta}
async function ensureHero(tripId,fileId){const s=await session(tripId);if(!s||s.role==='viewer')return;await syncHero({id:tripId,heroFileId:fileId},s)}
async function heroUrl(tripId,fileId){let value;try{value=await get('files',fileId)}catch{}if(value?.blob)return URL.createObjectURL(value.blob);if(!navigator.onLine)return'';const s=await session(tripId);if(!s)return'';let response;try{const headers=s.token?{Authorization:`Bearer ${s.token}`}:{ };response=await fetch(`/api/trips/${encodeURIComponent(tripId)}/hero`,{headers,credentials:'same-origin',cache:'no-store'})}catch{return''}if(!response.ok)return'';const blob=await response.blob();value={id:fileId,entityType:'trip',entityId:tripId,name:'여행 대표사진',mime:blob.type||'image/jpeg',size:blob.size,deviceId,blob};await put('files',value);return URL.createObjectURL(blob)}
const BACKUP_STATUS_KEY='last-backup-status';
const BACKUP_COLLECTIONS=['items','flights','lodgings','expenses','checklist','files','expenseMembers'];
const BACKUP_IGNORED_KEYS=new Set(['revision','hero','heroData','heroSharedData','data']);
const SENSITIVE_BACKUP_KEYS=new Set(['accountid','googleaccountid','googlesub','email','emailaddress','emailverified','avatarurl','profilepictureurl','cookie','token','tokenhash','accesstoken','idtoken','authcookie','authsessiontoken','sessionid','sessiontoken','sessiontokenhash','legacyaccesstoken','rawlegacyaccesstoken','invite','invitetoken','invitetokenhash','recoverykey','recoverykeyhash','recoverycode','recoverycodehash','oauthstate','oauthnonce','nonce','codeverifier','pkceverifier','clientsecret','apikey','securityevents','iphash']);
function stripBackupSecrets(value){if(!value||typeof value!=='object')return value;if(Array.isArray(value)){for(const item of value)stripBackupSecrets(item);return value}for(const key of Object.keys(value)){const normalized=key.replace(/[^a-z0-9]/gi,'').toLowerCase();if(SENSITIVE_BACKUP_KEYS.has(normalized))delete value[key];else stripBackupSecrets(value[key])}return value}
function stableBackupValue(value){
  if(value===undefined)return'null';
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return`[${value.map(stableBackupValue).join(',')}]`;
  return`{${Object.keys(value).filter(key=>!BACKUP_IGNORED_KEYS.has(key)&&!SENSITIVE_BACKUP_KEYS.has(key.replace(/[^a-z0-9]/gi,'').toLowerCase())).sort().map(key=>`${JSON.stringify(key)}:${stableBackupValue(value[key])}`).join(',')}}`;
}
function backupChangeIndex(state){
  const result={};
  for(const trip of state?.trips||[]){
    const root={};
    for(const [key,value] of Object.entries(trip))if(!BACKUP_COLLECTIONS.includes(key))root[key]=value;
    result[`trip:${trip.id}`]=stableBackupValue(root);
    for(const key of BACKUP_COLLECTIONS)for(const [index,value] of (trip[key]||[]).entries())result[`${key}:${trip.id}:${value?.id||index}`]=stableBackupValue(value);
  }
  return result;
}
function backupChangeCount(state,baseline={}){
  const current=backupChangeIndex(state),keys=new Set([...Object.keys(baseline||{}),...Object.keys(current)]);
  let changes=0;for(const key of keys)if(current[key]!==baseline?.[key])changes++;
  return changes;
}
async function backupStatus(state=stateRef){
  const record=await get('meta',BACKUP_STATUS_KEY);
  if(record?.exportedAt&&record.baseline)return{lastBackup:record.exportedAt,changes:backupChangeCount(state,record.baseline)};
  return{lastBackup:await get('meta','last-backup')||'',changes:0};
}
async function completeBackup(state,exportedAt=new Date().toISOString()){
  const record={exportedAt,baseline:backupChangeIndex(state)};
  await put('meta',record,BACKUP_STATUS_KEY);
  return{lastBackup:record.exportedAt,changes:0};
}
async function exportBackup(state){const fileSummary=await backupReadiness(state),copy=stripBackupSecrets(structuredClone(state)),seen=new Set();for(const trip of copy.trips||[]){for(const entity of [...(trip.items||[]),...(trip.flights||[]),...(trip.lodgings||[])])for(const doc of entity.userDocs||[]){if(seen.has(doc.id))continue;seen.add(doc.id);const value=await get('files',doc.id);if(value?.blob)doc.data=await blobDataUrl(value.blob)}for(const file of trip.files||[]){if(file.id===trip.heroFileId||seen.has(file.id))continue;seen.add(file.id);const value=await get('files',file.id);if(value?.blob)file.data=await blobDataUrl(value.blob)}if(trip.heroFileId){const value=await get('files',trip.heroFileId);if(value?.blob)trip.heroData=await blobDataUrl(value.blob)}}const summary=window.YeogiroData?.backupSummary(copy)||{},exportedAt=new Date().toISOString();return{format:'yeogiro-backup-v2',exportedAt,summary,fileSummary,state:copy}}
function embeddedFileSummary(state){const refs=new Map;for(const trip of state.trips||[]){for(const entity of [...(trip.items||[]),...(trip.flights||[]),...(trip.lodgings||[])])for(const doc of entity.userDocs||[])if(doc?.id)refs.set(doc.id,Boolean(doc.data));for(const file of trip.files||[])if(file?.id)refs.set(file.id,Boolean(file.data)||refs.get(file.id)||false);if(trip.heroFileId)refs.set(trip.heroFileId,Boolean(trip.heroData)||refs.get(trip.heroFileId)||false)}const included=[...refs.values()].filter(Boolean).length;return{total:refs.size,included,missing:refs.size-included,bytes:0,estimatedBytes:new Blob([JSON.stringify(state)]).size}}
function previewBackup(value,current=stateRef){const incoming=value?.format==='yeogiro-backup-v2'?value.state:value;if(!incoming||!Array.isArray(incoming.trips)||!incoming.trips.length)throw new Error('백업에 여행 데이터가 없습니다.');const summary=window.YeogiroData?.backupSummary(incoming)||{},fileSummary=value?.fileSummary||embeddedFileSummary(incoming),currentIds=new Set((current?.trips||[]).map(x=>x.id)),conflicts=incoming.trips.filter(x=>currentIds.has(x.id)).map(x=>({id:x.id,title:x.title}));return{summary,fileSummary,conflicts,state:incoming}}
function remapTrip(trip){const copy=structuredClone(trip),oldHero=copy.heroFileId;copy.id=`trip_${crypto.randomUUID().replace(/-/g,'')}`;const maps={item:new Map,flight:new Map,lodging:new Map},fileMap=new Map,newFileId=old=>{if(!fileMap.has(old))fileMap.set(old,`file_${crypto.randomUUID().replace(/-/g,'')}`);return fileMap.get(old)};for(const [type,entities] of [['item',copy.items||[]],['flight',copy.flights||[]],['lodging',copy.lodgings||[]]])for(const entity of entities){const old=entity.id;entity.id=`${type}_${crypto.randomUUID().replace(/-/g,'')}`;maps[type].set(old,entity.id);for(const doc of entity.userDocs||[]){doc.id=newFileId(doc.id);doc.entityType=type;doc.entityId=entity.id}}for(const lodging of copy.lodgings||[])if(lodging.itemId)lodging.itemId=maps.item.get(lodging.itemId)||'';for(const expense of copy.expenses||[]){expense.id=`expense_${crypto.randomUUID().replace(/-/g,'')}`;expense.paidByMemberId='local:self';expense.shareMemberIds=['local:self'];if(expense.linkedType)expense.linkedId=maps[expense.linkedType]?.get(expense.linkedId)||'';if(!expense.linkedId)expense.linkedType=''}copy.expenseMembers=[];if(copy.expenseSettings){copy.expenseSettings.settledAt='';copy.expenseSettings.settlementFingerprint=''}for(const file of copy.files||[]){file.id=newFileId(file.id);file.entityId=file.entityType==='trip'?copy.id:(maps[file.entityType]?.get(file.entityId)||file.entityId)}copy.heroFileId=oldHero?newFileId(oldHero):'';delete copy.revision;return copy}
async function importBackup(value,options={}){const preview=previewBackup(value,options.current||stateRef),incoming=structuredClone(preview.state),mode=options.mode||'overwrite',current=structuredClone(options.current||stateRef||{trips:[],activeId:''});if(mode==='new')incoming.trips=incoming.trips.map(remapTrip);const ids=new Set(incoming.trips.map(x=>x.id)),kept=(current.trips||[]).filter(x=>!ids.has(x.id)),combined={...current,trips:[...kept,...incoming.trips],activeId:incoming.trips[0]?.id||current.activeId};return migrateLegacy(combined)}
async function auditFiles(trip){const refs=new Map,add=(meta,kind='document')=>{if(!meta?.id)return;const before=refs.get(meta.id);refs.set(meta.id,{...(before||{}),...meta,kind:before?.kind==='document'?'document':kind})};for(const entity of [...(trip.items||[]),...(trip.flights||[]),...(trip.lodgings||[])])for(const doc of entity.userDocs||[])add(doc);for(const file of trip.files||[])add(file,file.id===trip.heroFileId||file.entityType==='trip'?'trip':'document');if(trip.heroFileId&&!refs.has(trip.heroFileId))add({id:trip.heroFileId,name:'여행 대표사진',entityType:'trip',entityId:trip.id},'trip');const result=[];for(const meta of refs.values()){const value=await get('files',meta.id),local=Boolean(value?.blob),actualSize=local?value.blob.size:0,mismatch=Boolean(local&&((meta.size&&actualSize!==meta.size)||(meta.mime&&value.blob.type&&meta.mime!==value.blob.type)));result.push({id:meta.id,name:meta.name||'파일',kind:meta.kind,metadata:true,local,mismatch,size:Number(meta.size)||0,actualSize,deviceId:meta.deviceId||'',reason:mismatch?'metadata':local?'local':'missing'})}return result}
async function repairFileMetadata(trip){const local=new Map;for(const file of await all('files'))if(file?.id&&file.blob)local.set(file.id,file);let repaired=0,seen=new Set,repair=meta=>{const value=local.get(meta?.id);if(!value?.blob)return;if(meta.size!==value.blob.size||value.blob.type&&meta.mime!==value.blob.type){meta.size=value.blob.size;meta.mime=value.blob.type||meta.mime||'application/octet-stream';if(!seen.has(meta.id)){seen.add(meta.id);repaired++}}};for(const entity of [...(trip.items||[]),...(trip.flights||[]),...(trip.lodgings||[])])for(const doc of entity.userDocs||[])repair(doc);for(const file of trip.files||[])repair(file);return repaired}
async function backupReadiness(state){const refs=new Map;for(const trip of state.trips||[]){for(const entity of [...(trip.items||[]),...(trip.flights||[]),...(trip.lodgings||[])])for(const doc of entity.userDocs||[])if(doc?.id)refs.set(doc.id,doc);for(const file of trip.files||[])if(file?.id)refs.set(file.id,file);if(trip.heroFileId&&!refs.has(trip.heroFileId))refs.set(trip.heroFileId,{id:trip.heroFileId,size:0})}let included=0,missing=0,mismatch=0,bytes=0;for(const [id,meta] of refs){const value=await get('files',id);if(value?.blob){included++;bytes+=value.blob.size;if(meta.size&&meta.size!==value.blob.size)mismatch++}else missing++}return{total:refs.size,included,missing,mismatch,bytes,estimatedBytes:new Blob([JSON.stringify(state)]).size+Math.ceil(bytes*4/3)}}
async function dataSafety(trip){const s=await session(trip.id),queued=(await all('outbox')).filter(x=>x.tripId===trip.id),files=await auditFiles(trip),storage={used:0,quota:0,supported:false,persisted:null,canPersist:Boolean(navigator.storage?.persist)};try{const estimate=await navigator.storage?.estimate?.();if(estimate)Object.assign(storage,{used:Number(estimate.usage)||0,quota:Number(estimate.quota)||0,supported:true})}catch{}try{const persisted=await navigator.storage?.persisted?.();if(typeof persisted==='boolean')storage.persisted=persisted}catch{}return{connected:Boolean(s),role:s?.role||'',pending:queued.length,conflict:status.conflict?.tripId===trip.id,lastSync:status.lastSync||'',storage,files:{total:files.length,local:files.filter(x=>x.local).length,localOnly:files.filter(x=>x.local&&x.deviceId===deviceId).length,missing:files.filter(x=>!x.local).length,mismatch:files.filter(x=>x.mismatch).length,bytes:files.reduce((sum,x)=>sum+x.actualSize,0),hero:files.filter(x=>x.kind==='trip').length,issues:files.filter(x=>!x.local||x.mismatch)}}}
async function share(role='editor',singleUse=true,expiresInDays=7){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id);if(!s)throw new Error('먼저 여행 동기화를 완료해 주세요.');expiresInDays=expiresInDays===null?null:([1,7,30].includes(Number(expiresInDays))?Number(expiresInDays):7);const result=await request(`/api/trips/${encodeURIComponent(t.id)}/invites`,{method:'POST',body:JSON.stringify({role,expiresInDays,singleUse})},s.token);return{...result,expiresInDays,link:`${location.origin}/#invite=${encodeURIComponent(result.token)}`}}
async function access(){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id);if(!s)throw new Error('동기화 정보가 없습니다.');return request(`/api/trips/${encodeURIComponent(t.id)}/access`,{},s.token)}
async function collaborationLog(){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id);if(!s)throw new Error('동기화 정보가 없습니다.');const[activity,trash]=await Promise.all([request(`/api/trips/${encodeURIComponent(t.id)}/activity`,{},s.token),request(`/api/trips/${encodeURIComponent(t.id)}/trash`,{},s.token)]);return{activities:activity.activities||[],trash:trash.trash||[]}}
async function restoreTrash(trashId){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id),result=await request(`/api/trips/${encodeURIComponent(t.id)}/trash/${encodeURIComponent(trashId)}/restore`,{method:'POST',body:'{}'},s.token),index=stateRef.trips.findIndex(x=>x.id===t.id);stateRef.trips[index]=mergeRemote(result.trip,stateRef.trips[index]);markSynced(stateRef.trips[index]);s.revision=result.trip.revision;await put('sessions',s);await del('outbox',t.id);await cacheState();if(remoteHandler)remoteHandler(stateRef);return result}
async function emptyTrash(){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id);if(!s)throw new Error('동기화 정보가 없습니다.');return request(`/api/trips/${encodeURIComponent(t.id)}/trash`,{method:'DELETE'},s.token)}
async function selfAccess(){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id);if(!s)throw new Error('동기화 정보가 없습니다.');return request(`/api/trips/${encodeURIComponent(t.id)}/me`,{},s.token)}
async function updateDisplayName(displayName){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id);return request(`/api/trips/${encodeURIComponent(t.id)}/me`,{method:'PATCH',body:JSON.stringify({displayName:String(displayName||'').trim().slice(0,40)})},s.token)}
async function issueDeviceCode(){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id);return request(`/api/trips/${encodeURIComponent(t.id)}/me/device-code`,{method:'POST',body:'{}'},s.token)}
async function connectSharedTrip(target,code){const tripId=cleanTripId(typeof target==='string'?target:target?.tripId),connectToken=cleanConnectToken(typeof target==='object'?target?.connectToken:'');if((!tripId&&!connectToken)||!String(code||'').trim())throw new Error('연결 코드를 확인해 주세요.');const result=await request('/api/device-links/redeem',{method:'POST',body:JSON.stringify({tripId,connectToken,code,...deviceInfo()})});await put('sessions',{tripId:result.tripId,token:result.accessToken,sessionId:result.sessionId,memberId:result.memberId,role:result.role,revision:result.trip.revision});status.memberByTrip[result.tripId]=result.memberId;const index=stateRef.trips.findIndex(x=>x.id===result.tripId),local=index>=0?stateRef.trips[index]:null,merged=mergeRemote(result.trip,local);if(index>=0)stateRef.trips[index]=merged;else stateRef.trips.push(merged);markSynced(merged);stateRef.activeId=result.tripId;status.roleByTrip[result.tripId]=result.role;status.deviceLinkTripId='';status.deviceLinkToken='';history.replaceState({},'',location.pathname);await cacheState();if(remoteHandler)remoteHandler(stateRef);return result}
async function leaveTrip(){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id);await request(`/api/trips/${encodeURIComponent(t.id)}/me`,{method:'DELETE'},s.token);await del('sessions',t.id);await del('outbox',t.id);status.roleByTrip[t.id]='';stateRef.trips=stateRef.trips.filter(x=>x.id!==t.id);if(!stateRef.trips.length)stateRef={trips:[],activeId:''};else stateRef.activeId=stateRef.trips[0].id;await cacheState();return{tripId:t.id}}
async function revoke(kind,idValue){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id);return request(`/api/trips/${encodeURIComponent(t.id)}/${kind}/${encodeURIComponent(idValue)}`,{method:'DELETE'},s.token)}
function cleanTripId(value){return String(value||'').trim().slice(0,100)}
function cleanConnectToken(value){return String(value||'').trim().replace(/[^A-Za-z0-9_-]/g,'').slice(0,100)}
async function recoverTrip(tripId,recoveryKey,confirmTransfer=false){tripId=cleanTripId(tripId);if(!tripId||!String(recoveryKey||'').trim())throw new Error('여행과 긴급 복구 코드를 확인해 주세요.');const result=await request('/api/recovery/redeem',{method:'POST',body:JSON.stringify({tripId,recoveryKey,confirmTransfer,...deviceInfo()})});await put('sessions',{tripId:result.tripId,token:result.accessToken,sessionId:result.sessionId,memberId:result.memberId,role:result.role,revision:result.trip.revision});status.memberByTrip[result.tripId]=result.memberId;status.roleByTrip[result.tripId]=result.role;status.recoverTripId='';await mergeTrip(result.trip);await persistState();dispatch();return result}
async function changeMemberRole(memberId,role){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id);return request(`/api/trips/${encodeURIComponent(t.id)}/members/${encodeURIComponent(memberId)}`,{method:'PATCH',body:JSON.stringify({role})},s.token)}
async function transferOwnership(memberId,previousOwner='editor'){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id),result=await request(`/api/trips/${encodeURIComponent(t.id)}/members/${encodeURIComponent(memberId)}/transfer`,{method:'POST',body:JSON.stringify({previousOwner})},s.token);s.role=result.previousOwnerRole==='removed'?'':result.previousOwnerRole;if(s.role)await put('sessions',s);else await del('sessions',t.id);status.roleByTrip[t.id]=s.role;return result}
async function revokeSession(sessionId){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id),result=await request(`/api/trips/${encodeURIComponent(t.id)}/sessions/${encodeURIComponent(sessionId)}`,{method:'DELETE'},s.token);if(result?.current){await del('sessions',t.id);await del('outbox',t.id);status.roleByTrip[t.id]=''}return result}
async function renameSession(sessionId,deviceName){const t=stateRef.trips.find(x=>x.id===stateRef.activeId),s=await session(t.id);return request(`/api/trips/${encodeURIComponent(t.id)}/sessions/${encodeURIComponent(sessionId)}`,{method:'PATCH',body:JSON.stringify({deviceName:String(deviceName||'').trim().slice(0,40)})},s.token)}
async function clearLocalAccountData(){for(const name of ['cache','sessions','files','outbox','meta'])await clearStore(name);for(const storage of [localStorage,sessionStorage])try{for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith('yeogiro-'))storage.removeItem(key)}}catch{}syncedFingerprints.clear();stateRef={trips:[],activeId:''};status.account=null;status.accountSession=null;status.claimableTripIds=[];status.roleByTrip={};status.memberByTrip={};status.pending=0;deviceId='';await initDevice();emit()}
async function routeCacheGet(key,maxAgeMs=7*86400000){const value=await get('meta',`route:${key}`);if(!value||Date.now()-Number(value.savedAt)>maxAgeMs){if(value)await del('meta',`route:${key}`);return null}return value.leg?{leg:value.leg,savedAt:Number(value.savedAt)}:null}
async function routeCachePut(key,leg){await put('meta',{savedAt:Date.now(),leg},`route:${key}`);return leg}
function onRemote(handler){remoteHandler=handler}
async function useRemote(tripId,remote){const index=stateRef.trips.findIndex(x=>x.id===tripId);if(index>=0){stateRef.trips[index]=mergeRemote(remote,stateRef.trips[index]);markSynced(stateRef.trips[index])}const s=await session(tripId);if(s){s.revision=remote.revision;await put('sessions',s)}await del('outbox',tripId);status.conflict=null;status.pending=(await all('outbox')).length;await cacheState();setStatus('다른 기기 변경사항을 반영했습니다.','idle');if(remoteHandler)remoteHandler(stateRef)}
async function reapplyLocal(tripId,local,remote){const index=stateRef.trips.findIndex(x=>x.id===tripId);if(index<0)return;const preserved=structuredClone(local);preserved.revision=remote.revision;stateRef.trips[index]=preserved;const s=await session(tripId);if(s){s.revision=remote.revision;await put('sessions',s)}await put('outbox',{tripId,updatedAt:Date.now()});status.conflict=null;status.pending=(await all('outbox')).length;await cacheState();setStatus('이 기기 변경사항을 저장하는 중입니다.','pending');if(remoteHandler)remoteHandler(stateRef);await flush()}

async function diagnostics(){
  const out={dbName:DB_NAME,dbVersion:DB_VERSION,stores:[],outbox:0,sessions:0,cached:false,ok:false};
  try{const db=await openDb();out.stores=[...db.objectStoreNames];out.outbox=(await all('outbox')).length;out.sessions=(await all('sessions')).length;out.cached=Boolean(await get('cache',STATE_KEY));out.ok=true}catch{out.ok=false}
  return out;
}
addEventListener('online',()=>{setStatus('인터넷 연결이 복구되었습니다.','syncing');flush();pullAll()});addEventListener('offline',()=>setStatus('변경사항은 이 기기에 안전하게 저장됩니다.','offline'));
window.YeogiroStore={bootstrap,persist,addFiles,fileUrl,fileBlob,hasFile,setHero,ensureHero,heroUrl,routeCacheGet,routeCachePut,exportBackup,completeBackup,backupStatus,previewBackup,importBackup,auditFiles,repairFileMetadata,backupReadiness,dataSafety,share,access,collaborationLog,restoreTrash,emptyTrash,selfAccess,updateDisplayName,issueDeviceCode,connectSharedTrip,leaveTrip,revoke,recoverTrip,changeMemberRole,transferOwnership,revokeSession,renameSession,refreshAccount,googleLogin,claimTrips,logoutAccount,authSessions,renameAuthSession,revokeAuthSession,revokeOtherAuthSessions,accountDeletion,deleteAccount,clearLocalAccountData,onRemote,useRemote,reapplyLocal,pull:pullAll,flush,status:()=>({...status}),diagnostics,device:()=>deviceId};
})();
