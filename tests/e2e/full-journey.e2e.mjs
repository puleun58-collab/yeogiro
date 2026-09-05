import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const port = 9300 + (process.pid % 400), base = `http://127.0.0.1:${port}`;
const persist = path.join(os.tmpdir(), `yeogiro-journey-${process.pid}-${Date.now()}`);
const quote = value => /[\s"]/u.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
const wrangler = args => {
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', ['npx', 'wrangler', ...args].map(quote).join(' ')], { encoding: 'utf8' })
    : spawnSync('npx', ['wrangler', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'wrangler command failed');
};
const shiftDay = offset => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { const response = await fetch(base); if (response.status < 500) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('journey E2E local Worker did not start');
}
async function api(route, { method = 'GET', token = '', body } = {}) {
  const headers = { 'CF-Connecting-IP': `journey-${process.pid}` };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + route, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  return { response, data };
}

function cannedForecast() {
  const days = [], hours = [];
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = shiftDay(offset);
    days.push(date);
    for (const hour of ['00', '03', '06', '09', '12', '15', '18', '21']) hours.push(`${date}T${hour}:00`);
  }
  return {
    timezone: 'Asia/Seoul',
    fetchedAt: new Date().toISOString(),
    current: { time: `${days[0]}T09:00`, temperature_2m: 27, apparent_temperature: 29, weather_code: 2, wind_speed_10m: 8, precipitation: 0, is_day: 1 },
    daily: {
      time: days,
      temperature_2m_max: days.map(() => 31),
      temperature_2m_min: days.map(() => 24),
      apparent_temperature_max: days.map(() => 33),
      apparent_temperature_min: days.map(() => 25),
      precipitation_sum: days.map(() => 0),
      precipitation_probability_max: days.map(() => 20),
      weather_code: days.map(() => 2),
      wind_speed_10m_max: days.map(() => 12)
    },
    hourly: {
      time: hours,
      temperature_2m: hours.map(() => 28),
      apparent_temperature: hours.map(() => 30),
      relative_humidity_2m: hours.map(() => 70),
      precipitation: hours.map(() => 0),
      precipitation_probability: hours.map(() => 20),
      weather_code: hours.map(() => 2),
      wind_speed_10m: hours.map(() => 10),
      is_day: hours.map(() => 1)
    }
  };
}

// ---- shared page helpers (single implementation reused by every data type) ----
async function openApp(context, { onboarded = true } = {}) {
  const page = await context.newPage(), problems = [], requests = [];
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    if (/ERR_INTERNET_DISCONNECTED|Failed to load resource|net::ERR/u.test(message.text())) return;
    problems.push(`console: ${message.text()}`);
  });
  page.on('request', request => { if (request.url().includes('/api/')) requests.push(`${request.method()} ${request.url().replace(base, '')}`); });
  if (onboarded) await page.addInitScript(() => { try { localStorage.setItem('yeogiro-onboarding-seen', '1'); } catch {} });
  // 설치 안내 모달은 별도 테스트에서 검증한다. 여정 테스트에서는 자동 노출을 끈다.
  await page.addInitScript(() => { try { localStorage.setItem('yeogiro-install-guide', JSON.stringify({ visits: 1, optOut: true, dismissedAt: '' })); } catch {} });
  // Deterministic forecast window (today..+7) so both "예보 가능" and "아직 예보 기간 전" are reachable,
  // and outbound routing stays offline so leg fallbacks are exercised without third-party latency.
  await page.route('**/api/weather*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cannedForecast()) }));
  await page.route('**/api/route*', route => route.abort('internetdisconnected'));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('#heroTitle').waitFor();
  page.problems = problems;
  page.apiRequests = requests;
  return page;
}
async function closeSheet(page) {
  if (await page.locator('#overlay.open').count()) {
    await page.evaluate(() => {
      const overlay = document.querySelector('#overlay');
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    });
  }
}
async function toastText(page) { return page.locator('#toast').textContent(); }
async function saveForm(page, formId) {
  await page.locator(`#${formId} button.save`).scrollIntoViewIfNeeded();
  await page.locator(`#${formId} button.save`).click();
  await page.locator('#overlay').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('#overlay.open'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(150);
}
async function pickChip(page, containerId, value) {
  await page.evaluate(({ containerId, value }) => {
    document.querySelector(`#${containerId} [data-value="${value}"]`)?.click();
  }, { containerId, value });
}
async function tripFormOpen(page, { fromWelcome = false } = {}) {
  await closeSheet(page);
  if (fromWelcome && await page.locator('[data-welcome-action="create"]').count()) await page.locator('[data-welcome-action="create"]').click();
  else await page.locator('.appbar-inner button').last().click();
  await page.locator('#tripForm input[name="title"]').waitFor();
}
async function fillTrip(page, { title, start, end, cities = [] }) {
  if (title !== undefined) await page.locator('#tripForm input[name="title"]').fill(title);
  if (start !== undefined) await page.locator('#tripForm input[name="start"]').fill(start);
  if (end !== undefined) await page.locator('#tripForm input[name="end"]').fill(end);
  for (const city of cities) {
    await page.locator('#tripCityInput').fill(city);
    await page.locator('#tripCityAdd').click();
  }
}
async function editActiveTrip(page, changes) {
  await closeSheet(page);
  await page.locator('#tripPick').click();
  await page.locator('#sheetBody [data-edittrip]').first().waitFor();
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#sheetBody .triprow')].find(node => node.innerText.includes('✓'));
    (row || document.querySelector('#sheetBody .triprow')).querySelector('[data-edittrip]').click();
  });
  await page.locator('#tripForm input[name="start"]').waitFor();
  await fillTrip(page, changes);
  await saveForm(page, 'tripForm');
  await closeSheet(page);
}
async function expandTimeOptions(page) {
  const endTime = page.locator('#itemForm input[name="endTime"]');
  if (!(await endTime.isVisible())) await page.evaluate(() => document.querySelector('#timeOptionsToggle')?.click());
  await endTime.waitFor({ state: 'visible', timeout: 5000 });
}
async function addItem(page, { day, time, endTime = '', name, place = '', memo = '', move = '' }) {
  await closeSheet(page);
  await page.locator('#addItem').click();
  await page.locator('#itemForm input[name="name"]').waitFor();
  await page.locator('#itemForm input[name="day"]').fill(day);
  await page.locator('#itemForm input[name="time"]').fill(time);
  if (endTime) {
    await expandTimeOptions(page);
    await page.locator('#itemForm input[name="endTime"]').fill(endTime);
  }
  await page.locator('#itemForm input[name="name"]').fill(name);
  if (place) await page.locator('#itemForm input[name="place"]').fill(place);
  if (memo) await page.locator('#itemForm textarea[name="memo"]').fill(memo);
  if (move) await pickChip(page, 'moveChips', move);
  await saveForm(page, 'itemForm');
  await closeSheet(page);
}
async function editItem(page, itemId, changes) {
  await closeSheet(page);
  await page.locator(`[data-act="edit"][data-id="${itemId}"]`).click();
  await page.locator('#itemForm input[name="name"]').waitFor();
  if (changes.day) await page.locator('#itemForm input[name="day"]').fill(changes.day);
  if (changes.time) await page.locator('#itemForm input[name="time"]').fill(changes.time);
  if (changes.endTime !== undefined) {
    await expandTimeOptions(page);
    await page.locator('#itemForm input[name="endTime"]').fill(changes.endTime);
  }
  if (changes.name) await page.locator('#itemForm input[name="name"]').fill(changes.name);
  if (changes.move) await pickChip(page, 'moveChips', changes.move);
  await saveForm(page, 'itemForm');
  await closeSheet(page);
}
async function search(page, query) {
  await closeSheet(page);
  await page.locator('#tripSearch').click();
  await page.locator('#tripSearchInput').fill(query);
  await page.waitForTimeout(220);
  const text = await page.locator('#tripSearchResults').innerText();
  await closeSheet(page);
  return text;
}
async function idb(page, storeName, key) {
  return page.evaluate(async ({ storeName, key }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('yeogiro-cache-v2', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName), store = tx.objectStore(storeName);
      const request = key === undefined ? store.getAll() : store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }, { storeName, key });
}
async function waitSynced(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => {
    const status = window.YeogiroStore?.status();
    return status && status.pending === 0 && status.phase === 'idle' && !status.conflict;
  }, null, { timeout: 20000 });
}
/**
 * One persistence contract for every data type: current screen -> cache -> reload -> server.
 * `probe` must return a JSON-comparable snapshot rendered from live state.
 */
async function expectPersisted(page, label, probe, { tripId, token, serverProbe } = {}) {
  const rendered = await probe(page);
  const cached = await idb(page, 'cache', 'app-state');
  assert.ok(cached?.trips?.length, `[${label}] IndexedDB 캐시에 상태 저장`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#heroTitle').waitFor();
  await closeSheet(page);
  const reloaded = await probe(page);
  assert.deepEqual(reloaded, rendered, `[${label}] 새로고침 후 동일 상태 유지`);
  if (tripId && token && serverProbe) {
    await waitSynced(page);
    const server = await api(`/api/trips/${tripId}`, { token });
    assert.deepEqual(serverProbe(server.data.trip), rendered, `[${label}] D1 동기화 상태 일치`);
  }
  return rendered;
}
async function openPreparation(page) {
  await closeSheet(page);
  // 여행 전 홈에는 준비 카드가 있지만 여행이 끝난 뒤에는 설정에서만 진입할 수 있다.
  if (await page.locator('[data-preparation]').count()) await page.evaluate(() => document.querySelector('[data-preparation]').click());
  else {
    await page.evaluate(() => document.querySelector('[data-open="settings"]').click());
    await page.locator('#preparation').waitFor();
    await page.evaluate(() => document.querySelector('#preparation').click());
  }
  await page.locator('.prep-sheet-header').waitFor();
}
async function prepNumbers(page) {
  await closeSheet(page);
  const home = await page.evaluate(() => {
    const card = document.querySelector('.home-prep-card');
    if (!card) return null;
    const lines = card.innerText.split('\n').map(line => line.trim()).filter(Boolean);
    return { progress: lines[0], required: lines.find(line => line.startsWith('출발 전 확인')) || '' };
  });
  await page.evaluate(() => document.querySelector('[data-preparation]')?.click());
  await page.locator('.prep-sheet-header').waitFor();
  const sheet = await page.evaluate(() => ({
    progress: document.querySelector('.prep-items-section .prep-section-head small').textContent.trim(),
    required: document.querySelectorAll('.prep-section-head h3')[1].textContent.trim(),
    optional: document.querySelector('.prep-disclosure summary')?.innerText.trim().split('\n')[0] || '',
  }));
  await closeSheet(page);
  return { home, sheet };
}

const build = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { encoding: 'utf8' })
  : spawnSync('npm', ['run', 'build'], { encoding: 'utf8' });
if (build.status !== 0) throw new Error(build.stderr || build.stdout || 'journey E2E app build failed');
wrangler(['d1', 'migrations', 'apply', 'yeogiro-db', '--local', '--persist-to', persist]);
const server = spawn(process.execPath, [path.resolve('node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--port', String(port), '--persist-to', persist], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk; });
server.stderr.on('data', chunk => { serverLog += chunk; });

let browser, checks = 0;
const done = label => { checks += 1; return label; };
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, serviceWorkers: 'block' });
  const page = await openApp(context);

  // ---- STEP 1: trip creation validation, then the real trip ----
  await tripFormOpen(page, { fromWelcome: true });
  await fillTrip(page, { title: '   ', start: shiftDay(30), end: shiftDay(33) });
  await saveForm(page, 'tripForm');
  assert.match(await toastText(page), /여행 제목을 입력해 주세요/, done('[validation] 공백 제목 거부'));
  await fillTrip(page, { title: '역방향 날짜', start: shiftDay(33), end: shiftDay(30) });
  await saveForm(page, 'tripForm');
  assert.match(await toastText(page), /여행 날짜를 확인해 주세요/, done('[validation] 종료일이 시작일보다 빠른 입력 거부'));
  const longTitle = '다낭·호이안 테스트 여행 ' + '가족과 함께하는 아주 긴 제목 '.repeat(2);
  await fillTrip(page, { title: longTitle, start: shiftDay(30), end: shiftDay(33), cities: ['다낭', '호이안'] });
  await saveForm(page, 'tripForm');
  await closeSheet(page);
  assert.equal(await page.locator('#heroTitle').textContent(), longTitle.slice(0, 60).trim(), done('[trip] 긴 제목을 60자 제한으로 저장'));
  assert.equal(await page.locator('#dday').textContent(), 'D-30', done('[trip] 상단 D-30 표시'));
  assert.equal(await page.locator('.page-tabs button').count(), 3, done('[trip] 일정·이동·경비 탭 유지'));
  assert.equal(await page.locator('.datechip').count(), 4, done('[trip] 여행 기간만큼 날짜 칩 생성'));
  assert.match(await page.locator('#heroSub').textContent(), /3박 4일/, done('[trip] 기간 요약 표시'));
  assert.ok(await page.locator('.home-prep-card').count(), done('[trip] 여행 전 홈 준비 카드 표시'));
  await waitSynced(page);
  const tripId = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('yeogiro-cache-v2', 1); request.onsuccess = () => resolve(request.result); });
    return new Promise(resolve => { const request = db.transaction('cache').objectStore('cache').get('app-state'); request.onsuccess = () => resolve(request.result.activeId); });
  });
  const sessionRow = (await idb(page, 'sessions')).find(row => row.tripId === tripId);
  assert.ok(sessionRow?.token, done('[sync] UI 생성 여행이 서버 세션을 확보'));
  const ownerToken = sessionRow.token;

  // ---- STEP 2: itinerary CRUD with the shared persistence contract ----
  const day1 = shiftDay(30), day2 = shiftDay(31);
  await addItem(page, { day: day1, time: '09:30', endTime: '10:30', name: '한시장 아침', place: '다낭 한시장', move: '도보' });
  await addItem(page, { day: day1, time: '12:00', name: '미케비치 산책이라는 아주 긴 이름의 일정 항목', place: '미케비치', move: '택시' });
  await addItem(page, { day: day1, time: '18:30', name: '위치 없는 자유 시간', memo: '위치 정보 없음' });
  await addItem(page, { day: day2, time: '10:00', name: '호이안 올드타운', place: '호이안 올드타운', move: '자동차' });
  const itemProbe = async target => target.evaluate(() => [...document.querySelectorAll('.item h3')].map(node => node.innerText.replace(/\s+/g, ' ').trim()));
  const itemsRendered = await expectPersisted(page, '일정', itemProbe, {
    tripId, token: ownerToken,
    serverProbe: trip => [...trip.items].sort((a, b) => `${a.day} ${a.time}`.localeCompare(`${b.day} ${b.time}`))
      .map(item => `${item.time}${item.endTime ? `–${item.endTime}` : ''}${item.name}`.replace(/\s+/g, ' ').trim()),
  });
  assert.equal(itemsRendered.length, 4, done('[일정] 4개 일정이 날짜별 목록에 표시'));
  assert.match(await search(page, '미케비치'), /미케비치/, done('[검색] 저장 직후 일정 검색 반영'));
  assert.match(await page.locator('.trip-focus').innerText(), /여행 준비/, done('[홈] 여행 전 홈이 준비 카드 유지'));

  // ---- STEP 2b: reorder recomputes derived movement data ----
  const itemIds = await page.evaluate(() => [...document.querySelectorAll('.item')].map(node => node.id.replace('item-', '')));
  await page.waitForTimeout(400);
  const legsBefore = await page.evaluate(() => [...document.querySelectorAll('.movement')].map(node => node.dataset.leg));
  assert.ok(legsBefore.length >= 1, done('[이동] 위치가 있는 연속 일정에서 이동 구간 계산'));
  await editItem(page, itemIds[0], { time: '15:30' });
  assert.match(await toastText(page), /종료시간은 시작시간보다 늦게/, done('[일정 검증] 종료시간보다 늦은 시작시간 입력 거부'));
  await closeSheet(page);
  await editItem(page, itemIds[0], { time: '15:30', endTime: '16:30' });
  await page.waitForTimeout(500);
  const orderAfter = await page.evaluate(() => {
    const section = document.querySelector('[data-day-section]');
    return section ? [...section.querySelectorAll('.item .time')].map(node => node.textContent.trim()) : [];
  });
  assert.deepEqual(orderAfter, ['12:00', '15:30–16:30', '18:30'], done('[일정 순서] 시간 변경 후 날짜별 순서 재계산'));
  const legsAfter = await page.evaluate(() => [...document.querySelectorAll('.movement')].map(node => node.dataset.leg));
  assert.notDeepEqual(legsAfter, legsBefore, done('[이동] 순서 변경 후 이동 구간이 이전 계산을 재사용하지 않음'));

  // ---- STEP 2c: delete removes every derived reference ----
  await closeSheet(page);
  page.once('dialog', dialog => dialog.accept());
  await page.locator(`[data-act="del"][data-id="${itemIds[2]}"]`).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator(`#item-${itemIds[2]}`).count(), 0, done('[일정 삭제] 목록에서 즉시 제거'));
  assert.doesNotMatch(await search(page, '위치 없는'), /위치 없는 자유 시간/, done('[검색] 삭제된 일정이 검색 결과에 남지 않음'));

  // ---- STEP 3: flights, including a +1 day arrival ----
  await closeSheet(page);
  await page.locator('#addFlight').click();
  await page.locator('#flightForm input[name="airline"]').waitFor();
  for (const [field, value] of [['airline', "T'way Air"], ['flightNumber', 'TW125'], ['departDate', day1], ['arriveDate', day1], ['from', 'ICN'], ['fromTerminal', '1'], ['depart', '20:45'], ['to', 'DAD'], ['toTerminal', '2'], ['arrive', '23:40']]) {
    await page.locator(`#flightForm input[name="${field}"]`).fill(value);
  }
  await saveForm(page, 'flightForm');
  await closeSheet(page);
  await page.locator('#addFlight').click();
  await page.locator('#flightForm input[name="airline"]').waitFor();
  for (const [field, value] of [['airline', "T'way Air"], ['flightNumber', 'TW126'], ['departDate', shiftDay(33)], ['arriveDate', shiftDay(34)], ['from', 'DAD'], ['depart', '23:50'], ['to', 'ICN'], ['arrive', '06:40']]) {
    await page.locator(`#flightForm input[name="${field}"]`).fill(value);
  }
  await saveForm(page, 'flightForm');
  await closeSheet(page);
  assert.equal(await page.locator('.flight').count(), 2, done('[항공편] 왕복 항공편 저장'));
  assert.match(await page.locator('.flight').nth(1).innerText(), /\+1일/, done('[항공편] 다음날 도착을 +1일로 표시'));
  assert.match(await page.locator('.flight').first().innerText(), /T1/, done('[항공편] 터미널 정보 표시'));
  assert.match(await search(page, 'TW126'), /TW126/, done('[검색] 항공편 편명 검색'));

  // ---- STEP 4: lodging validation + auto-check release ----
  const requiredBeforeLodging = await prepNumbers(page);
  assert.match(requiredBeforeLodging.home.required, /출발 전 확인 1건/, done('[자동 점검] 항공편 등록 후 확인 필요 1건(숙소)만 남음'));
  assert.equal(requiredBeforeLodging.home.required.replace('출발 전 확인 ', ''), requiredBeforeLodging.sheet.required.replace('출발 전 확인 · ', ''), done('[일관성] 홈과 준비 시트가 같은 확인 건수 사용'));
  await closeSheet(page);
  await page.locator('#addLodging').click();
  await page.locator('#lodgingForm input[name="name"]').waitFor();
  await page.locator('#lodgingForm input[name="name"]').fill('그랜드 시그니처 리조트 호이안 오션 스위트');
  await page.locator('#lodgingForm input[name="checkInDate"]').fill(day2);
  await page.locator('#lodgingForm input[name="checkOutDate"]').fill(day1);
  await page.locator('#lodgingForm input[name="address"]').fill('Hoi An, Quang Nam');
  await saveForm(page, 'lodgingForm');
  assert.match(await toastText(page), /체크아웃|확인/, done('[숙소] 체크아웃이 체크인보다 빠른 입력 거부'));
  await page.locator('#lodgingForm input[name="checkOutDate"]').fill(shiftDay(33));
  await saveForm(page, 'lodgingForm');
  await closeSheet(page);
  assert.equal(await page.locator('.lodging-card').count(), 1, done('[숙소] 정상 날짜 숙소 저장'));
  const afterLodging = await prepNumbers(page);
  assert.match(afterLodging.home.required, /출발 전 확인 0건/, done('[자동 점검] 숙소 등록 즉시 확인 필요 0건'));
  assert.match(afterLodging.sheet.required, /출발 전 확인 · 0건/, done('[자동 점검] 준비 시트도 즉시 0건'));
  assert.equal(afterLodging.home.progress, `여행 준비 ${afterLodging.sheet.progress.replace(' 완료', '')} 완료`, done('[일관성] 홈 진행률과 시트 진행률 동일'));

  // ---- STEP 5: preparation items ----
  await openPreparation(page);
  const baseRows = await page.evaluate(() => document.querySelectorAll('[data-prep-row]').length);
  await page.locator('#prepAdd input').fill('우산');
  await page.locator('.prep-add-button').click();
  await page.waitForTimeout(300);
  await page.locator('#prepAdd input').fill('공용 보조배터리');
  await page.locator('#prepAdd select').selectOption('shared');
  await page.locator('.prep-add-button').click();
  await page.waitForTimeout(300);
  const prepTotals = await page.evaluate(() => ({
    rows: document.querySelectorAll('[data-prep-row]').length,
    shared: [...document.querySelectorAll('.prep-copy')].filter(node => node.innerText.includes('공용')).length,
  }));
  assert.equal(prepTotals.rows, baseRows + 2, done('[준비물] 기본 준비물에 개인·공용 준비물 추가'));
  assert.equal(prepTotals.shared, 1, done('[준비물] 공용 범위 저장'));
  for (let index = 0; index < 4; index += 1) {
    await page.evaluate(() => { const box = [...document.querySelectorAll('[data-prep-toggle]')].find(node => !node.checked); if (box) box.click(); });
    await page.waitForTimeout(200);
  }
  const midProgress = await prepNumbers(page);
  assert.equal(midProgress.sheet.progress, `4 / ${baseRows + 2} 완료`, done('[준비 진행률] 시트 진행률 갱신'));
  assert.equal(midProgress.home.progress, `여행 준비 4 / ${baseRows + 2} 완료`, done('[준비 진행률] 홈 카드가 같은 수치 사용'));
  await openPreparation(page);
  await page.evaluate(() => { const row = [...document.querySelectorAll('[data-prep-row]')].find(node => node.innerText.includes('우산')); row.querySelector('.prep-menu > summary').click(); row.querySelector('[data-prep-delete]').click(); });
  await page.waitForTimeout(320);
  const afterDelete = await prepNumbers(page);
  assert.equal(afterDelete.sheet.progress, `4 / ${baseRows + 1} 완료`, done('[준비물] 삭제가 총계에 즉시 반영'));
  assert.equal(afterDelete.home.progress, `여행 준비 4 / ${baseRows + 1} 완료`, done('[준비물] 삭제가 홈 카드에도 즉시 반영'));

  // ---- STEP 6: D-Day boundaries and phase transitions ----
  // The app refuses a trip window that would orphan saved schedules, so the window
  // always keeps the existing items inside while only the start date moves.
  for (const [offset, expected] of [[7, 'D-7'], [1, 'D-1'], [0, '오늘 출발']]) {
    await editActiveTrip(page, { start: shiftDay(offset), end: shiftDay(33) });
    assert.equal(await page.locator('#dday').textContent(), expected, done(`[D-Day] ${expected} 경계값 표시`));
  }
  const duringHome = await page.locator('.trip-focus').innerText();
  assert.match(duringHome, /여행 1일차/, done('[여행 중] 홈이 여행 n일차 상태로 전환'));
  assert.equal(await page.locator('.home-prep-card').count(), 0, done('[여행 중] 준비 Primary CTA가 최상단을 차지하지 않음'));
  const pastDay = shiftDay(-9);
  await editActiveTrip(page, { start: pastDay, end: shiftDay(33) });
  const scheduleIds = await page.evaluate(() => [...document.querySelectorAll('.item')].map(node => node.id.replace('item-', '')));
  for (const id of scheduleIds) await editItem(page, id, { day: pastDay });
  await editActiveTrip(page, { start: pastDay, end: shiftDay(-6) });
  assert.equal(await page.locator('#dday').textContent(), '여행 종료', done('[여행 종료] 상단 상태가 여행 종료로 전환'));
  const afterHome = await page.locator('.trip-focus').innerText();
  assert.match(afterHome, /여행 완료/, done('[여행 종료] 홈이 기록 중심으로 전환'));
  assert.doesNotMatch(afterHome, /D-\d+|다음 일정|출발 권장|오늘 이동/, done('[여행 종료] 진행형 UI 제거'));
  assert.equal(await page.locator('.home-prep-card').count(), 0, done('[여행 종료] 준비 CTA 제거'));
  assert.equal(await page.locator('#weatherStrip').count(), 0, done('[여행 종료] 현재 날씨 중심 UI 제거'));

  // ---- STEP 7: recap uses stored data only ----
  await page.locator('[data-after-trip="schedule"]').click();
  await page.locator('#sheetBody h2').waitFor();
  const recap = await page.locator('#sheetBody').innerText();
  assert.match(recap, /일정 3개/, done('[여행 기록] 저장된 일정 수만 표시'));
  assert.doesNotMatch(recap, /실제 이동거리/, done('[여행 기록] 위치가 일부만 있으면 단정적 이동거리 표현 미사용'));
  await closeSheet(page);

  // ---- STEP 8: past trip stays editable and recomputes the recap ----
  await addItem(page, { day: shiftDay(-9), time: '11:00', name: '지난 여행 추가 일정', place: '다낭 대성당' });
  await page.locator('[data-after-trip="schedule"]').click();
  await page.locator('#sheetBody h2').waitFor();
  assert.match(await page.locator('#sheetBody').innerText(), /일정 4개/, done('[지난 여행] 수정 후 기록 요약 재계산'));
  await closeSheet(page);

  // ---- STEP 9: expenses keep their stored rate ----
  await page.locator('.page-tabs button[data-page="expense"]').click();
  await page.locator('[data-expense-add]').first().click();
  await page.locator('#expenseForm input[name="amount"]').waitFor();
  await page.locator('#expenseForm input[name="amount"]').fill('30000');
  await page.locator('#expenseForm input[name="title"]').fill('공항 택시');
  await page.locator('#expenseForm select[name="category"]').selectOption('교통');
  await page.locator('#expenseForm input[name="spentAt"]').fill(shiftDay(-9));
  await saveForm(page, 'expenseForm');
  await closeSheet(page);
  await page.locator('[data-expense-add]').first().click();
  await page.locator('#expenseForm input[name="amount"]').waitFor();
  await page.locator('#expenseForm input[name="amount"]').fill('20');
  await page.locator('#expenseForm select[name="currency"]').selectOption('USD');
  await page.locator('#expenseForm input[name="manualBaseAmount"]').fill('138000');
  await page.locator('#expenseForm input[name="title"]').fill('환전 수수료');
  await page.locator('#expenseForm input[name="spentAt"]').fill(shiftDay(-8));
  await saveForm(page, 'expenseForm');
  await closeSheet(page);
  const storedRate = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('yeogiro-cache-v2', 1); request.onsuccess = () => resolve(request.result); });
    const state = await new Promise(resolve => { const request = db.transaction('cache').objectStore('cache').get('app-state'); request.onsuccess = () => resolve(request.result); });
    const trip = state.trips.find(item => item.id === state.activeId);
    return trip.expenses.map(expense => ({ currency: expense.currency, rateMicros: expense.rateMicros, convertedMinor: expense.convertedMinor }));
  });
  assert.equal(storedRate.length, 2, done('[경비] KRW와 외화 지출 저장'));
  const foreign = storedRate.find(row => row.currency === 'USD');
  assert.ok(foreign.rateMicros > 0 && foreign.convertedMinor > 0, done('[경비] 외화 지출이 저장 시점 환율로 환산액 보관'));
  assert.match(await page.locator('.expense-hero-total').innerText(), /₩|원|,/, done('[경비] 총액 요약 표시'));
  await page.locator('[data-expense-budget]').click();
  await page.locator('#expenseBudgetForm select[name="baseCurrency"]').waitFor();
  await page.locator('#expenseBudgetForm input[name="budget"]').fill('500000');
  await saveForm(page, 'expenseBudgetForm');
  await closeSheet(page);
  const rateAfterSettings = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('yeogiro-cache-v2', 1); request.onsuccess = () => resolve(request.result); });
    const state = await new Promise(resolve => { const request = db.transaction('cache').objectStore('cache').get('app-state'); request.onsuccess = () => resolve(request.result); });
    const trip = state.trips.find(item => item.id === state.activeId);
    return trip.expenses.map(expense => ({ currency: expense.currency, rateMicros: expense.rateMicros, convertedMinor: expense.convertedMinor }));
  });
  // 서버 왕복 후 지출 순서는 spent_at 기준으로 정렬되므로 통화 기준으로 비교한다.
  const byCurrency = rows => [...rows].sort((a, b) => a.currency.localeCompare(b.currency));
  assert.deepEqual(byCurrency(rateAfterSettings), byCurrency(storedRate), done('[경비] 예산·기준 통화 설정 저장이 과거 지출 환율을 바꾸지 않음'));
  await page.locator('.page-tabs button[data-page="schedule"]').click();

  // ---- STEP 10: search reflects renames and stays live ----
  const renameTarget = await page.evaluate(() => document.querySelector('.item').id.replace('item-', ''));
  const previousName = await page.evaluate(id => document.querySelector(`#item-${id} h3`).innerText.replace(/^\d{2}:\d{2}(–\d{2}:\d{2})?/, '').trim(), renameTarget);
  await editItem(page, renameTarget, { name: '변경된 일정 이름' });
  assert.match(await search(page, '변경된 일정'), /변경된 일정 이름/, done('[검색] 변경한 이름을 즉시 검색'));
  // 장소명은 그대로 남을 수 있으므로 이전 이름이 결과 제목으로 남지 않는지 확인한다.
  await closeSheet(page);
  await page.locator('#tripSearch').click();
  await page.locator('#tripSearchInput').fill(previousName);
  await page.waitForTimeout(260);
  const staleTitles = await page.evaluate(() => [...document.querySelectorAll('#tripSearchResults .search-result b')].map(node => node.innerText.trim()));
  await closeSheet(page);
  assert.equal(staleTitles.includes(previousName), false, done('[검색] 이전 이름이 결과 제목에 남지 않음'));

  // ---- STEP 11: JSON backup and restore into a clean profile ----
  await waitSynced(page);
  const backup = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('yeogiro-cache-v2', 1); request.onsuccess = () => resolve(request.result); });
    const state = await new Promise(resolve => { const request = db.transaction('cache').objectStore('cache').get('app-state'); request.onsuccess = () => resolve(request.result); });
    return YeogiroStore.exportBackup(state);
  });
  assert.ok(backup.state.trips[0].items.length >= 3 && backup.state.trips[0].flights.length === 2 && backup.state.trips[0].lodgings.length === 1, done('[백업] 일정·항공·숙소가 백업에 포함'));
  const backupChecklist = backup.state.trips[0].checklist.length;
  assert.ok(backup.state.trips[0].expenses.length === 2 && backupChecklist === baseRows + 1, done('[백업] 경비와 준비물이 백업에 포함'));
  const backupDir = await mkdtemp(path.join(os.tmpdir(), 'yeogiro-backup-'));
  const backupFile = path.join(backupDir, 'yeogiro-backup.json');
  await writeFile(backupFile, JSON.stringify(backup, null, 2), 'utf8');
  const cleanContext = await browser.newContext({ viewport: { width: 320, height: 568 }, serviceWorkers: 'block' });
  const cleanPage = await openApp(cleanContext);
  await closeSheet(cleanPage);
  await cleanPage.locator('#importInput').setInputFiles(backupFile);
  await cleanPage.locator('[data-backup-mode="new"]').waitFor();
  await cleanPage.locator('[data-backup-mode="new"]').click();
  await cleanPage.waitForTimeout(700);
  await closeSheet(cleanPage);
  const restored = await cleanPage.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('yeogiro-cache-v2', 1); request.onsuccess = () => resolve(request.result); });
    const state = await new Promise(resolve => { const request = db.transaction('cache').objectStore('cache').get('app-state'); request.onsuccess = () => resolve(request.result); });
    const trip = state.trips.find(item => (item.items || []).length >= 3);
    return { items: trip.items.length, flights: trip.flights.length, lodgings: (trip.lodgings || []).length, expenses: (trip.expenses || []).length, checklist: (trip.checklist || []).length };
  });
  assert.deepEqual(restored, { items: backup.state.trips[0].items.length, flights: 2, lodgings: 1, expenses: 2, checklist: backupChecklist }, done('[복원] 여행·일정·항공·숙소·경비·준비물 복원'));
  await cleanContext.close();

  // ---- STEP 12: offline writes for the newer data types ----
  await context.setOffline(true);
  await openPreparation(page);
  // 개인 준비물 완료는 기기 로컬에만 저장되므로 동기화 대상인 공용 준비물을 토글한다.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('[data-prep-row]')].find(node => node.innerText.includes('공용 보조배터리'));
    row.querySelector('[data-prep-toggle]').click();
  });
  await page.waitForTimeout(300);
  await closeSheet(page);
  await page.waitForFunction(() => YeogiroStore.status().pending >= 1, null, { timeout: 15000 });
  assert.equal((await idb(page, 'outbox')).length, 1, done('[오프라인] 준비물 변경이 IndexedDB 큐에 저장'));
  // Service Worker를 차단한 컨텍스트에서는 오프라인 새로고침으로 셸을 받을 수 없으므로
  // 동기화 경로만 막은 상태로 앱을 다시 시작해 대기 큐 유지를 확인한다.
  const blockTripSync = route => route.abort('internetdisconnected');
  await page.route(`**/api/trips/${tripId}`, blockTripSync);
  await context.setOffline(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await context.setOffline(true);
  await page.unroute(`**/api/trips/${tripId}`, blockTripSync);
  await page.locator('#heroTitle').waitFor();
  assert.equal((await idb(page, 'outbox')).length, 1, done('[오프라인] 앱 재실행 후 대기 큐 유지'));
  assert.ok(await page.locator('.datechip').count() > 0, done('[오프라인] 재실행 후에도 여행과 일정 접근 가능'));
  await context.setOffline(false);
  await waitSynced(page);
  const afterReconnect = await api(`/api/trips/${tripId}`, { token: ownerToken });
  assert.equal((await idb(page, 'outbox')).length, 0, done('[복구] 온라인 복귀 후 대기 큐 0건'));
  assert.equal(afterReconnect.data.trip.items.filter(item => item.name === '변경된 일정 이름').length, 1, done('[복구] 재동기화에서 중복 생성 없음'));
  assert.equal(afterReconnect.data.trip.checklist.filter(entry => entry.title === '공용 보조배터리').length, 1, done('[복구] 공용 준비물이 서버에 한 번만 저장'));

  // ---- STEP 13: duplicate request guard on a single screen entry ----
  page.apiRequests.length = 0;
  await page.locator('.page-tabs button[data-page="overview"]').click();
  await page.waitForTimeout(900);
  await page.locator('.page-tabs button[data-page="schedule"]').click();
  await page.waitForTimeout(600);
  const duplicated = Object.entries(page.apiRequests.reduce((acc, key) => ({ ...acc, [key]: (acc[key] || 0) + 1 }), {}))
    .filter(([route, count]) => count > 1 && /\/api\/(weather|exchange-rate)/.test(route));
  assert.deepEqual(duplicated, [], done('[중복 요청] 한 화면 진입에서 동일 날씨·환율 요청 반복 없음'));
  const tripPulls = page.apiRequests.filter(entry => entry === `GET /api/trips/${tripId}`).length;
  assert.ok(tripPulls <= 2, done('[중복 요청] 화면 전환이 여행 동기화를 반복 호출하지 않음'));
  console.log(`중복 요청 기준선: 화면 전환 API 호출 ${page.apiRequests.length}건 · 여행 동기화 ${tripPulls}건`);

  // ---- STEP 14: realistic data volume ----
  const volumeContext = await browser.newContext({ viewport: { width: 320, height: 568 }, serviceWorkers: 'block' });
  const volumePage = await openApp(volumeContext);
  // 대량 상태의 클라이언트 렌더·검색 성능만 측정한다. 10개 여행 업로드가 측정에 끼어들지 않게 동기화를 막는다.
  await volumePage.route('**/api/trips**', route => route.abort('internetdisconnected'));
  await volumePage.evaluate(async () => {
    const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const trips = [];
    for (let index = 0; index < 10; index += 1) {
      const start = new Date(); start.setDate(start.getDate() + 5 + index * 7);
      const end = new Date(start); end.setDate(start.getDate() + 3);
      const items = [], expenses = [];
      for (let n = 0; n < 50; n += 1) {
        const day = new Date(start); day.setDate(start.getDate() + (n % 4));
        items.push({ id: `vol_${index}_item_${n}`, day: iso(day), time: `${String(6 + (n % 14)).padStart(2, '0')}:${n % 2 ? '30' : '00'}`, endTime: '', preparationMinutes: 0, cat: '명소', name: `대량 일정 ${index}-${n}`, place: `장소 ${n}`, mapUrl: '', memo: '', move: '도보', alarm: '', reservationNumber: '', provider: '', lat: null, lng: null, userDocs: [] });
      }
      for (let n = 0; n < 100; n += 1) {
        expenses.push({ id: `vol_${index}_exp_${n}`, title: `지출 ${n}`, category: ['식비', '교통', '숙소'][n % 3], amountMinor: 1000 + n, currency: 'KRW', baseCurrency: 'KRW', rateMicros: 1000000, convertedMinor: 1000 + n, rateUpdatedAt: '', rateSource: '', paidByMemberId: 'local:self', shareMemberIds: ['local:self'], spentAt: iso(start), memo: '', linkedType: '', linkedId: '' });
      }
      trips.push({ id: `vol_${index}`, title: `대량 테스트 여행 ${index}`, start: iso(start), end: iso(end), note: '', cities: ['다낭'], flights: [], lodgings: [], items, expenses, expenseSettings: { baseCurrency: 'KRW', budgetMinor: null, settledAt: '', settlementFingerprint: '' }, hero: '', files: [], checklist: [] });
    }
    const state = { trips, activeId: trips[0].id };
    const db = await new Promise(resolve => { const request = indexedDB.open('yeogiro-cache-v2', 1); request.onsuccess = () => resolve(request.result); });
    await new Promise(resolve => { const tx = db.transaction(['cache', 'sessions', 'outbox'], 'readwrite'); tx.objectStore('cache').put(state, 'app-state'); tx.objectStore('sessions').clear(); tx.objectStore('outbox').clear(); tx.oncomplete = resolve; });
    localStorage.setItem('yeogiro-data-v1', JSON.stringify(state));
  });
  const renderStart = Date.now();
  await volumePage.reload({ waitUntil: 'domcontentloaded' });
  await volumePage.locator('.item').first().waitFor({ timeout: 45000 });
  const renderMs = Date.now() - renderStart;
  await closeSheet(volumePage);
  const searchStart = Date.now();
  // 검색은 현재 선택한 여행 안에서 동작하므로 활성 여행의 일정을 조회한다.
  const volumeSearch = await search(volumePage, '대량 일정 0-12');
  const searchMs = Date.now() - searchStart;
  assert.match(volumeSearch, /대량 일정 0-12/, done('[데이터량] 여행 10개·일정 500개 상태에서도 검색 동작'));
  assert.ok(renderMs < 12000, done(`[데이터량] 대량 상태 첫 렌더 ${renderMs}ms`));
  assert.ok(searchMs < 4000, done(`[데이터량] 대량 상태 검색 ${searchMs}ms`));
  console.log(`데이터량 기준선: 여행 10개·일정 500개·경비 1000건 첫 렌더 ${renderMs}ms · 검색 ${searchMs}ms`);
  assert.deepEqual(volumePage.problems, [], done('[안정성] 대량 데이터에서 콘솔 오류 없음'));
  await volumeContext.close();

  assert.deepEqual(page.problems, [], `[안정성] 주 시나리오 콘솔 오류 없음:\n${page.problems.join('\n')}`);
  checks += 1;
  await context.close();
  console.log(`${checks} full journey E2E checks passed: 여행 생성→일정→항공→숙소→준비→D-Day→여행 종료→기록→경비→검색→백업/복원→오프라인→중복요청→데이터량`);
} catch (error) {
  throw new Error(`${error.message}\n--- failing step ---\n${(error.stack || '').split('\n').slice(1, 5).join('\n')}\n--- local worker log ---\n${serverLog.slice(-4000)}`);
} finally {
  await browser?.close();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
  else server.kill();
}
