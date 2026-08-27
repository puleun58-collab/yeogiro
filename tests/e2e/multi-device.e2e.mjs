import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { createTestTrip, createOwner, createEditor } from '../helpers/fixtures.mjs';

const port = 8800 + (process.pid % 500), base = `http://127.0.0.1:${port}`;
const persist = path.join(os.tmpdir(), `yeogiro-e2e-${process.pid}-${Date.now()}`);
const quote = value => /[\s"]/u.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
const commandLine = args => ['npx', 'wrangler', ...args].map(quote).join(' ');
const wrangler = args => {
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', commandLine(args)], { encoding:'utf8' })
    : spawnSync('npx', ['wrangler', ...args], { encoding:'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'wrangler command failed');
};

async function waitForServer() {
  for (let attempt=0; attempt<100; attempt+=1) {
    try { const response=await fetch(base); if (response.status<500) return; } catch {}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw new Error('E2E local Worker did not start');
}
async function api(route,{method='GET',token='',body}={}) {
  const headers={'CF-Connecting-IP':`e2e-${process.pid}`}; if(token)headers.Authorization=`Bearer ${token}`;
  if(body)headers['Content-Type']='application/json';
  const response=await fetch(base+route,{method,headers,body:body?JSON.stringify(body):undefined});
  const data=response.status===204?null:await response.json().catch(()=>null); return{response,data};
}
async function seed(page,trip,accessToken,sessionId,role) {
  await page.goto(`${base}/offline`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async value=>{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('yeogiro-cache-v2',1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('cache'))db.createObjectStore('cache');if(!db.objectStoreNames.contains('sessions'))db.createObjectStore('sessions',{keyPath:'tripId'});if(!db.objectStoreNames.contains('files'))db.createObjectStore('files',{keyPath:'id'});if(!db.objectStoreNames.contains('outbox'))db.createObjectStore('outbox',{keyPath:'tripId'});if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
    const state={activeId:value.trip.id,trips:[value.trip]};
    await new Promise((resolve,reject)=>{const tx=db.transaction(['cache','sessions','outbox'],'readwrite');tx.objectStore('cache').clear();tx.objectStore('sessions').clear();tx.objectStore('outbox').clear();tx.objectStore('cache').put(state,'app-state');tx.objectStore('sessions').put({tripId:value.trip.id,token:value.accessToken,sessionId:value.sessionId,role:value.role,revision:value.trip.revision});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
    localStorage.setItem('yeogiro-data-v1',JSON.stringify(state));
  },{trip,accessToken,sessionId,role});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#heroTitle').waitFor();
}
async function idb(page,storeName,key) {
  return page.evaluate(async ({storeName,key})=>{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('yeogiro-cache-v2',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
    return new Promise((resolve,reject)=>{const tx=db.transaction(storeName),store=tx.objectStore(storeName),request=key===undefined?store.getAll():store.get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  },{storeName,key});
}
async function editItem(page,itemId,{name,memo}) {
  if(await page.locator('#overlay.open').count())await page.evaluate(()=>{const overlay=document.querySelector('#overlay');overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');document.body.style.overflow=''});
  await page.locator(`[data-act="edit"][data-id="${itemId}"]`).click();
  if(name!==undefined)await page.locator('#itemForm [name="name"]').fill(name);
  if(memo!==undefined)await page.locator('#itemForm [name="memo"]').fill(memo);
  await page.locator('#itemForm button.save').click();
  await page.locator('#overlay').waitFor({state:'hidden'});
  await page.waitForTimeout(120); await page.evaluate(()=>YeogiroStore.flush());
}
async function waitSynced(page) {
  await page.waitForTimeout(550);
  await page.waitForFunction(()=>{const s=window.YeogiroStore?.status();return s&&s.pending===0&&s.phase==='idle'&&!s.conflict},{timeout:15000});
}
async function waitServerRevision(id,token,minimum) {
  for(let attempt=0;attempt<80;attempt+=1){const result=await api(`/api/trips/${id}`,{token});if(result.data?.trip?.revision>=minimum)return result.data.trip;await new Promise(resolve=>setTimeout(resolve,150))}
  throw new Error(`[sync] server revision did not reach ${minimum}`);
}

const build=process.platform==='win32'
  ? spawnSync('cmd.exe',['/d','/s','/c','npm run build'],{encoding:'utf8'})
  : spawnSync('npm',['run','build'],{encoding:'utf8'});
if(build.status!==0)throw new Error(build.stderr||build.stdout||'E2E app build failed');
wrangler(['d1','migrations','apply','yeogiro-db','--local','--persist-to',persist]);
const server=spawn(process.execPath,[path.resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--local','--port',String(port),'--persist-to',persist],{stdio:['ignore','pipe','pipe']});
let serverLog=''; server.stdout.on('data',chunk=>serverLog+=chunk); server.stderr.on('data',chunk=>serverLog+=chunk);
let browser;
try {
  await waitForServer();
  const id=`e2e_${Date.now()}`, fixture=createTestTrip(id);
  const created=await api('/api/trips',{method:'POST',body:{trip:fixture,...createOwner()}});
  assert.equal(created.response.status,201,'[setup] device A owner trip creation');
  const invite=await api(`/api/trips/${id}/invites`,{method:'POST',token:created.data.accessToken,body:{role:'editor',singleUse:true,expiresInDays:7}});
  const joined=await api('/api/invites/redeem',{method:'POST',body:{token:invite.data.token,...createEditor()}});
  assert.equal(joined.response.status,201,'[setup] device B invite redeem');

  browser=await chromium.launch({headless:true});
  const contextA=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),contextB=await browser.newContext({viewport:{width:430,height:932},serviceWorkers:'block'});
  const pageA=await contextA.newPage(),pageB=await contextB.newPage(),unexpected=[];
  for(const [label,page] of [['A',pageA],['B',pageB]]){
    page.on('pageerror',error=>unexpected.push(`${label} pageerror: ${error.message}`));
    page.on('console',message=>{if(message.type()==='error'&&!/ERR_INTERNET_DISCONNECTED|Failed to load resource/u.test(message.text()))unexpected.push(`${label} console: ${message.text()}`)});
  }
  await seed(pageA,created.data.trip,created.data.accessToken,created.data.sessionId,'owner');
  await seed(pageB,joined.data.trip,joined.data.accessToken,joined.data.sessionId,'editor');

  const blockTripPull=route=>route.request().method()==='GET'?route.abort('internetdisconnected'):route.continue();
  await pageB.route(`**/api/trips/${id}`,blockTripPull);
  await editItem(pageA,`${id}_item`,{name:'A의 바나힐 일정',memo:'A에서 시간 확인'}); await waitSynced(pageA); await waitServerRevision(id,created.data.accessToken,2);
  await editItem(pageB,`${id}_item`,{name:'B의 바나힐 일정',memo:'B에서 장소 확인'});
  await pageB.waitForFunction(()=>Boolean(YeogiroStore.status().conflict),{timeout:10000}); if(!(await pageB.locator('[data-conflict="remote"]').isVisible()))await pageB.locator('#syncStatus').click();
  assert.equal(await pageB.locator('[data-conflict="remote"]').textContent(),'다른 기기 변경사항 반영','[conflict] existing remote-choice copy');
  await pageB.locator('[data-conflict="remote"]').click(); await waitSynced(pageB);
  await pageB.unroute(`**/api/trips/${id}`,blockTripPull);
  let state=await api(`/api/trips/${id}`,{token:created.data.accessToken});
  assert.equal(state.data.trip.items.filter(item=>item.id===`${id}_item`).length,1,'[conflict remote] no duplicate item');
  assert.equal(state.data.trip.items.find(item=>item.id===`${id}_item`).name,'A의 바나힐 일정','[conflict remote] server and selected remote state match');

  await pageA.evaluate(()=>YeogiroStore.pull()); await pageB.evaluate(()=>YeogiroStore.pull());
  await pageB.route(`**/api/trips/${id}`,blockTripPull);
  await editItem(pageA,`${id}_item`,{memo:'A의 최신 메모'}); await waitSynced(pageA); await waitServerRevision(id,created.data.accessToken,3);
  await editItem(pageB,`${id}_item`,{memo:'B의 최종 메모'});
  await pageB.waitForFunction(()=>Boolean(YeogiroStore.status().conflict),{timeout:10000}); if(!(await pageB.locator('[data-conflict="local"]').isVisible()))await pageB.locator('#syncStatus').click();
  assert.equal(await pageB.locator('[data-conflict="local"]').textContent(),'이 기기 변경사항으로 저장','[conflict] existing local-choice copy');
  await pageB.locator('[data-conflict="local"]').click(); await waitSynced(pageB);
  await pageB.unroute(`**/api/trips/${id}`,blockTripPull);
  state=await api(`/api/trips/${id}`,{token:created.data.accessToken});
  assert.equal(state.data.trip.items.find(item=>item.id===`${id}_item`).memo,'B의 최종 메모','[conflict local] selected local state reached D1');
  assert.equal(state.data.trip.revision,4,'[conflict] monotonic revision after both resolutions');
  assert.equal((await idb(pageB,'outbox')).length,0,'[conflict] outbox cleared only after server confirmation');

  await contextB.setOffline(true);
  await pageB.locator('#addItem').click();
  await pageB.locator('#itemForm [name="day"]').fill('2026-08-23'); await pageB.locator('#itemForm [name="time"]').fill('14:00');
  await pageB.locator('#itemForm [name="name"]').fill('오프라인 추가 일정'); await pageB.locator('#itemForm button.save').click();
  await pageB.locator('#overlay').waitFor({state:'hidden'}); await pageB.waitForFunction(()=>YeogiroStore.status().pending===1);
  assert.equal((await idb(pageB,'outbox')).length,1,'[offline] pending change stored in IndexedDB outbox');
  const blockTripSync=route=>route.abort('internetdisconnected');
  await pageB.route(`**/api/trips/${id}`,blockTripSync); await contextB.setOffline(false);
  await pageB.reload({waitUntil:'domcontentloaded'}); await contextB.setOffline(true); await pageB.unroute(`**/api/trips/${id}`,blockTripSync);
  const restoredOutbox=await idb(pageB,'outbox');
  assert.equal(restoredOutbox.length,1,'[offline reload] pending outbox survived app restart');
  const restoredCache=await idb(pageB,'cache','app-state'),restoredTrip=restoredCache.trips.find(trip=>trip.id===id);
  assert.equal(restoredTrip.items.filter(item=>item.name==='오프라인 추가 일정').length,1,'[offline reload] cached payload retained the local edit');

  await pageB.locator('#tripSearch').click(); await pageB.locator('#tripSearchInput').fill('TW 125');
  await pageB.getByText('TW125 · ICN → DAD',{exact:true}).waitFor();
  await pageB.locator('[data-close]').last().click();
  await contextB.setOffline(false); await waitSynced(pageB);
  state=await api(`/api/trips/${id}`,{token:created.data.accessToken});
  assert.equal(state.data.trip.items.filter(item=>item.name==='오프라인 추가 일정').length,1,'[reconnect] queued item synced once');
  assert.equal((await idb(pageB,'outbox')).length,0,'[reconnect] pending count returned to zero');
  assert.equal(unexpected.length,0,`[console] unexpected runtime errors:\n${unexpected.join('\n')}`);

  await contextA.close(); await contextB.close();
  console.log('multi-device browser E2E passed: conflict(remote/local), offline restart/reconnect, indexedDB outbox, offline search');
} catch(error) {
  throw new Error(`${error.message}\n--- local worker log ---\n${serverLog.slice(-6000)}`);
} finally {
  await browser?.close();
  if(process.platform==='win32')spawnSync('taskkill',['/pid',String(server.pid),'/t','/f'],{stdio:'ignore'});else server.kill();
}
