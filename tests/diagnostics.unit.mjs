import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Diag = require('../diagnostics.js');
let checks = 0;
const check = () => { checks += 1; };

// ---- classification ----
assert.equal(Diag.classify('WEATHER_FETCH'), 'weather', '날씨 오류 분류'); check();
assert.equal(Diag.classify('ROUTE_FETCH_502'), 'route', '경로 오류 분류'); check();
assert.equal(Diag.classify('SYNC_PUSH_FAILED'), 'sync', '동기화 오류 분류'); check();
assert.equal(Diag.classify('DOC_ANALYSIS_FAILED'), 'document-analysis', '문서 분석 오류 분류'); check();
assert.equal(Diag.classify('SW_INSTALL_FAILED'), 'pwa', 'Service Worker 오류 분류'); check();
assert.equal(Diag.classify('IDB_OPEN_FAILED'), 'storage', '저장소 오류 분류'); check();
assert.equal(Diag.classify('API_HEALTH_500', { status: 500 }), 'api', 'API 오류 분류'); check();
assert.equal(Diag.classify('API_REQUEST_403', { status: 403 }), 'permission', '권한 오류가 status로 분류'); check();
assert.equal(Diag.classify('API_REQUEST_409', { status: 409 }), 'conflict', '충돌 오류가 status로 분류'); check();
assert.equal(Diag.classify('APP_ACTION_FAILED', { offline: true }), 'network', '오프라인 상황이 network로 분류'); check();
assert.equal(Diag.classify('SOMETHING_ELSE'), 'unknown', '알 수 없는 오류는 unknown'); check();
assert.ok(Diag.CATEGORIES.includes('permission') && Diag.CATEGORIES.length === 11, '오류 분류 목록 유지'); check();

// ---- privacy: only whitelisted metadata survives ----
const leaky = Diag.sanitize({
  code: 'sync_push_failed',
  area: 'sync',
  screen: 'schedule',
  version: 'v1.0.0-abc1234',
  message: '예약번호 ABC123 저장 실패',
  reservationNumber: 'ABC123',
  token: 'secret-token',
  email: 'user@example.com',
  memo: '여권 M12345678',
  file: 'voucher.pdf'
});
assert.deepEqual(Object.keys(leaky).sort(), ['area', 'category', 'code', 'screen', 'version'], '허용된 메타데이터만 저장'); check();
assert.equal(leaky.code, 'SYNC_PUSH_FAILED', '오류 코드는 대문자 스네이크로 정규화'); check();
assert.equal(leaky.category, 'sync', '분류가 함께 저장'); check();
assert.equal(JSON.stringify(leaky).includes('ABC123'), false, '예약번호가 로그에 남지 않음'); check();
assert.equal(JSON.stringify(leaky).includes('secret-token'), false, '토큰이 로그에 남지 않음'); check();
assert.equal(JSON.stringify(leaky).includes('example.com'), false, '이메일이 로그에 남지 않음'); check();
assert.equal(JSON.stringify(leaky).includes('M12345678'), false, '여권 정보가 로그에 남지 않음'); check();
assert.equal(Diag.sanitize({}).code, 'UNKNOWN', '코드가 없으면 UNKNOWN'); check();
assert.equal(Diag.sanitize({ code: 'X'.repeat(80) }).code.length, 40, '오류 코드 길이 제한'); check();

// ---- dedupe and cap ----
const now = Date.parse('2026-09-03T00:00:00.000Z');
let log = [];
for (let index = 0; index < 12; index += 1) {
  log = Diag.append(log, { code: 'WEATHER_FETCH', area: 'weather', screen: 'schedule' }, { now: now + index * 1000 });
}
assert.equal(log.length, 1, '짧은 시간 반복 오류는 한 항목으로 합산'); check();
assert.equal(log[0].count, 12, '반복 횟수를 누적'); check();
assert.equal(Diag.summarize(log)[0], 'WEATHER_FETCH × 12', '반복 오류 요약 표기'); check();

log = Diag.append(log, { code: 'WEATHER_FETCH', area: 'weather', screen: 'schedule' }, { now: now + 120000 });
assert.equal(log.length, 2, '중복 창을 넘긴 재발은 새 항목으로 기록'); check();
assert.equal(log[0].count, 1, '새 항목은 횟수가 1로 시작'); check();
assert.equal(log[1].count, 12, '이전 합산 항목은 그대로 보관'); check();

log = Diag.append(log, { code: 'ROUTE_FETCH', area: 'route', screen: 'overview' }, { now: now + 130000 });
assert.equal(log.length, 3, '다른 오류는 별도 항목'); check();
assert.equal(log[0].code, 'ROUTE_FETCH', '최근 오류가 앞에 위치'); check();

let capped = [];
for (let index = 0; index < 40; index += 1) {
  capped = Diag.append(capped, { code: `CODE_${index}`, area: 'api', screen: 'app' }, { now: now + index * 120000 });
}
assert.equal(capped.length, Diag.MAX_ENTRIES, '로그 항목 수 상한 유지'); check();
assert.equal(capped[0].code, 'CODE_39', '가장 최근 오류를 보관'); check();

// ---- storage round trip with an injected store ----
const memory = new Map();
const storage = { getItem: key => (memory.has(key) ? memory.get(key) : null), setItem: (key, value) => memory.set(key, value) };
Diag.record({ code: 'SYNC_PULL_401', area: 'sync', screen: 'home', version: 'v1.0.0' }, { storage, now });
Diag.record({ code: 'SYNC_PULL_401', area: 'sync', screen: 'home', version: 'v1.0.0' }, { storage, now: now + 5000 });
const stored = Diag.recent({ storage });
assert.equal(stored.length, 1, '저장된 로그도 합산'); check();
assert.equal(stored[0].count, 2, '저장된 반복 횟수 유지'); check();
assert.equal(stored[0].category, 'sync', '저장 후에도 분류 유지'); check();
assert.equal(Diag.clear({ storage }).length, 0, '오류 기록 삭제'); check();
assert.equal(Diag.recent({ storage }).length, 0, '삭제 후 빈 로그'); check();
assert.deepEqual(Diag.recent({ storage: { getItem: () => '{'
  , setItem: () => {} } }), [], '깨진 로그는 빈 배열로 복구'); check();

// ---- support report ----
const report = Diag.report({
  version: 'v1.0.0 · 1056eaa',
  online: true,
  sync: '최근 저장 2026년 9월 3일 12:00',
  serviceWorker: '활성 · yeogiro-app-v79',
  storage: 'yeogiro-cache-v2 v1 · 대기 0건',
  api: '정상 · D1 ok',
  errors: stored
});
assert.match(report, /앱 버전: v1\.0\.0 · 1056eaa/, '복사 정보에 앱 버전 포함'); check();
assert.match(report, /네트워크: 온라인/, '복사 정보에 네트워크 상태 포함'); check();
assert.match(report, /Service Worker: 활성 · yeogiro-app-v79/, '복사 정보에 SW 상태 포함'); check();
assert.match(report, /최근 오류: SYNC_PULL_401 × 2/, '복사 정보에 오류 코드와 횟수 포함'); check();
assert.equal(/ABC123|token|@|여권/.test(report), false, '복사 정보에 민감정보 없음'); check();
assert.equal(Diag.report({}).includes('최근 오류: 없음'), true, '오류가 없으면 없음으로 표기'); check();

// ---- app wiring ----
const html = readFileSync('index.html', 'utf8');
assert.match(html, /<meta name="yeogiro-build" content="__APP_BUILD__">/, '빌드 식별자 자리표시자 존재'); check();
assert.match(html, /<script src="\/diagnostics\.js\?v=79"><\/script>/, '진단 모듈 로드'); check();
assert.match(html, /id="appDiagnostics"/, '설정에서 진단 화면 진입'); check();
assert.match(html, /async function appDiagnosticsSheet\(\)/, '진단 시트 구현'); check();
assert.match(html, /YeogiroStore\.diagnostics\(\)/, '저장소 상태 조회'); check();
assert.match(html, /fetch\('\/api\/health'/, 'API·D1 상태 확인'); check();
assert.match(html, /data-copy-diagnostics/, '진단 정보 복사 동작'); check();
assert.match(html, /addEventListener\('unhandledrejection'/, '처리되지 않은 promise 오류 기록'); check();
assert.match(html, /recordIssue\('WEATHER_FETCH'/, '날씨 실패 기록'); check();
assert.match(html, /recordIssue\('ROUTE_FETCH'/, '경로 실패 기록'); check();
assert.match(html, /recordIssue\('DOC_ANALYSIS_FAILED'/, '문서 분석 실패 기록'); check();
assert.equal(/appDiagnostics[^]{0,400}home-prep-card/.test(html), false, '진단 화면은 홈에 노출되지 않음'); check();

const sync = readFileSync('sync.js', 'utf8');
assert.match(sync, /lastSyncError:''/, '마지막 동기화 실패 시각 보관'); check();
assert.match(sync, /status\.lastSyncErrorCode='SYNC_PUSH_'/, '푸시 실패 코드 기록'); check();
assert.match(sync, /status\.lastSyncErrorCode='SYNC_PULL_'/, '풀 실패 코드 기록'); check();
assert.match(sync, /async function diagnostics\(\)/, '저장소 진단 함수 제공'); check();

const worker = readFileSync('worker.js', 'utf8');
assert.match(worker, /url\.pathname==='\/api\/health'&&request\.method==='GET'/, 'health 경로 등록'); check();
assert.match(worker, /SELECT 1 AS ok/, 'D1 연결을 가벼운 질의로 확인'); check();
assert.equal(/health[^]{0,200}(SELECT \*|token_hash)/.test(worker), false, 'health 응답은 사용자 데이터를 읽지 않음'); check();

console.log(`${checks} diagnostics and error log checks passed`);
