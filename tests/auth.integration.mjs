import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const appPort = 9000 + (process.pid % 300);
const providerPort = appPort + 400;
const base = `http://127.0.0.1:${appPort}`;
const providerBase = `http://127.0.0.1:${providerPort}`;
const persist = `.wrangler/auth-test-${process.pid}`;
const runIp = `auth-test-${process.pid}-${Date.now()}`;
const clientId = 'yeogiro-test-client';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
Object.assign(jwk, { kid: 'test-key', use: 'sig', alg: 'RS256' });
const pendingCodes = new Map();

const quote = value => /[\s"]/u.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
const commandLine = args => ['npx', 'wrangler', ...args].map(quote).join(' ');
function wrangler(args) {
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', commandLine(args)], { encoding: 'utf8' })
    : spawnSync('npx', ['wrangler', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || 'wrangler command failed');
  return result.stdout;
}
function b64(value) { return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url'); }
function idToken({ nonce, sub, name, email }) {
  const seconds = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT', kid: jwk.kid });
  const body = b64({ iss: 'https://accounts.google.com', aud: clientId, sub, name, email, email_verified: true, picture: `https://profiles.invalid/${sub}.jpg`, nonce, iat: seconds, exp: seconds + 600 });
  const unsigned = `${head}.${body}`;
  const signature = createSign('RSA-SHA256').update(unsigned).end().sign(privateKey).toString('base64url');
  return `${unsigned}.${signature}`;
}
const provider = createServer((request, response) => {
  const url = new URL(request.url, providerBase);
  if (url.pathname === '/certs') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ keys: [jwk] }));
    return;
  }
  if (url.pathname === '/token' && request.method === 'POST') {
    let raw = '';
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      const code = new URLSearchParams(raw).get('code');
      const identity = pendingCodes.get(code);
      if (!identity) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ id_token: idToken(identity), access_token: 'discarded-by-worker', token_type: 'Bearer', expires_in: 600 }));
    });
    return;
  }
  response.writeHead(404);
  response.end();
});
await new Promise((resolve, reject) => provider.listen(providerPort, '127.0.0.1', resolve).once('error', reject));

function trip(id) {
  return { id, title: '계정 통합 테스트 여행', start: '2026-08-22', end: '2026-08-24', note: '', cities: ['서울'], heroFileId: '', checklist: [], items: [{ id: `${id}_item`, day: '2026-08-22', time: '10:00', endTime: '', preparationMinutes: 0, fixed: false, moveMinutes: null, reminderMinutes: 0, cat: '명소', name: '계정 테스트 일정', place: '', mapUrl: '', memo: '', move: '도보', alarm: '', reservationNumber: '', provider: '', lat: null, lng: null, userDocs: [] }], flights: [], lodgings: [], expenses: [], files: [] };
}
function cookieFrom(response, name) {
  const source = response.headers.get('set-cookie') || '';
  const match = source.match(new RegExp(`${name}=([^;,]*)`));
  assert.ok(match, `${name} 쿠키 발급`);
  return `${name}=${match[1]}`;
}
async function api(route, { method = 'GET', token = '', cookie = '', body, redirect = 'follow' } = {}) {
  const headers = new Headers({ 'CF-Connecting-IP': runIp });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (cookie) headers.set('Cookie', cookie);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect });
  let data = null;
  try { data = await response.json(); } catch {}
  return { response, data };
}
async function login({ sub, name, email, deviceName }) {
  const start = await api(`/api/auth/google/start?policy=1.0&return_to=%2F&deviceId=${encodeURIComponent(`device-${deviceName}`)}&deviceName=${encodeURIComponent(deviceName)}&platform=Test&clientType=browser`, { redirect: 'manual' });
  assert.equal(start.response.status, 302, 'OAuth 시작 리디렉션');
  const stateCookie = cookieFrom(start.response, '__Host-yeogiro_oauth_state');
  const setCookie = start.response.headers.get('set-cookie') || '';
  assert.match(setCookie, /Secure/i, 'OAuth state Secure 쿠키');
  assert.match(setCookie, /HttpOnly/i, 'OAuth state HttpOnly 쿠키');
  assert.match(setCookie, /SameSite=Lax/i, 'OAuth state SameSite 쿠키');
  const authorization = new URL(start.response.headers.get('location'));
  assert.equal(authorization.origin, providerBase, '설정한 OIDC 승인 엔드포인트 사용');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256', 'PKCE S256 사용');
  assert.ok(authorization.searchParams.get('code_challenge'), 'PKCE challenge 생성');
  assert.ok(authorization.searchParams.get('state'), 'state 생성');
  assert.ok(authorization.searchParams.get('nonce'), 'nonce 생성');
  const code = `code-${sub}-${Date.now()}-${Math.random()}`;
  pendingCodes.set(code, { nonce: authorization.searchParams.get('nonce'), sub, name, email });
  const callback = await api(`/api/auth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(authorization.searchParams.get('state'))}`, { cookie: stateCookie, redirect: 'manual' });
  assert.equal(callback.response.status, 302, 'OAuth 콜백 성공');
  assert.match(callback.response.headers.get('location') || '', /auth=success/, '로그인 완료 표시');
  const authCookie = cookieFrom(callback.response, '__Host-yeogiro_session');
  assert.match(callback.response.headers.get('set-cookie') || '', /HttpOnly/i, '앱 세션 HttpOnly 쿠키');
  return { authCookie, stateCookie, callbackPath: `/api/auth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(authorization.searchParams.get('state'))}` };
}
async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { const response = await fetch(base + '/api/health'); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('계정 통합 테스트 Worker가 시작되지 않았습니다.');
}

wrangler(['d1', 'migrations', 'apply', 'yeogiro-db', '--local', '--persist-to', persist]);
const args = [path.resolve('node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--port', String(appPort), '--persist-to', persist,
  '--var', `APP_ORIGIN:${base}`, '--var', `GOOGLE_CLIENT_ID:${clientId}`, '--var', 'GOOGLE_CLIENT_SECRET:test-secret',
  '--var', `GOOGLE_AUTHORIZATION_ENDPOINT:${providerBase}/authorize`, '--var', `GOOGLE_TOKEN_ENDPOINT:${providerBase}/token`, '--var', `GOOGLE_JWKS_URI:${providerBase}/certs`];
const worker = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let workerLog = '';
worker.stdout.on('data', chunk => { workerLog += chunk; });
worker.stderr.on('data', chunk => { workerLog += chunk; });

try {
  await waitForServer();
  assert.equal((await api('/api/auth/config')).data.googleEnabled, true, 'Google 로그인 운영 설정 감지');
  assert.equal((await api('/api/auth/google/start')).response.status, 400, '정책 버전 없는 로그인 시작 거부');
  const crossSite = await fetch(`${base}/api/auth/google/start?policy=1.0`, { headers: { 'Sec-Fetch-Site': 'cross-site', 'CF-Connecting-IP': runIp } });
  assert.equal(crossSite.status, 403, '교차 사이트 로그인 시작 거부');

  const tripId = `auth_trip_${Date.now()}`;
  const legacy = await api('/api/trips', { method: 'POST', body: { trip: trip(tripId), displayName: '기존 소유자', deviceId: 'legacy', deviceName: '기존 기기', platform: 'Windows', clientType: 'browser' } });
  assert.equal(legacy.response.status, 201, '기존 비계정 여행 생성');
  assert.equal(legacy.data.accountLinked, false, '로그인 전 여행은 자동 귀속하지 않음');
  const ownerToken = legacy.data.accessToken;

  const first = await login({ sub: 'owner-google-id', name: '계정 소유자', email: 'owner@example.test', deviceName: '첫 기기' });
  const me = await api('/api/auth/me', { cookie: first.authCookie });
  assert.equal(me.response.status, 200, '계정 세션 인증');
  assert.deepEqual({ name: me.data.account.displayName, email: me.data.account.email, provider: me.data.account.provider }, { name: '계정 소유자', email: 'owner@example.test', provider: 'google' }, '검증된 Google 계정 정보 저장');
  assert.equal(me.data.policies.termsVersion, '1.0', '이용약관 버전 기록');
  assert.equal(me.data.policies.privacyVersion, '1.0', '개인정보 처리방침 버전 기록');

  const rejectedReplay = await api(first.callbackPath, { cookie: first.stateCookie, redirect: 'manual' });
  assert.match(rejectedReplay.response.headers.get('location') || '', /auth=failed/, 'OAuth state 재사용 거부');

  const claim = await api(`/api/auth/trips/${encodeURIComponent(tripId)}/claim`, { method: 'POST', token: ownerToken, cookie: first.authCookie, body: {} });
  assert.equal(claim.response.status, 200, '기존 여행을 로그인 계정에 명시적으로 연결');
  assert.equal((await api('/api/auth/trips', { cookie: first.authCookie })).data.trips[0].trip.id, tripId, '계정 여행 목록 반환');

  const second = await login({ sub: 'owner-google-id', name: '계정 소유자', email: 'owner@example.test', deviceName: '새 기기' });
  const restored = await api('/api/auth/trips', { cookie: second.authCookie });
  assert.equal(restored.data.trips[0].trip.id, tripId, '새 기기에서 같은 계정 여행 복원');
  const sessionList = await api('/api/auth/sessions', { cookie: first.authCookie });
  assert.equal(sessionList.data.sessions.filter(session => !session.revoked_at).length, 2, '계정 로그인 기기 두 대 표시');
  const secondSession = sessionList.data.sessions.find(session => session.device_name === '새 기기');
  const renamed = await api(`/api/auth/sessions/${secondSession.id}`, { method: 'PATCH', cookie: first.authCookie, body: { deviceName: '여행용 브라우저' } });
  assert.equal(renamed.data.deviceName, '여행용 브라우저', '로그인 기기 이름 변경');
  assert.equal((await api(`/api/auth/sessions/${secondSession.id}`, { method: 'DELETE', cookie: first.authCookie })).response.status, 200, '다른 기기 로그아웃');
  assert.equal((await api('/api/auth/me', { cookie: second.authCookie })).response.status, 401, '해지한 기기 세션 재사용 거부');
  assert.equal((await api(`/api/trips/${tripId}`, { token: ownerToken })).response.status, 200, '계정 연결 후 기존 여행 토큰 호환');

  const invite = await api(`/api/trips/${tripId}/invites`, { method: 'POST', token: ownerToken, body: { role: 'editor', singleUse: true } });
  const guest = await login({ sub: 'guest-google-id', name: '초대 계정', email: 'guest@example.test', deviceName: '초대 기기' });
  const joined = await api('/api/invites/redeem', { method: 'POST', cookie: guest.authCookie, body: { token: invite.data.token, deviceId: 'guest', deviceName: '초대 기기', platform: 'Test', clientType: 'browser' } });
  assert.equal(joined.response.status, 201, '로그인 계정으로 초대 참여');
  assert.equal(joined.data.accountLinked, true, '초대 membership 계정 연결');
  assert.equal((await api('/api/auth/account', { cookie: guest.authCookie })).data.canDelete, true, '비소유 계정 삭제 가능');
  assert.equal((await api('/api/auth/account', { method: 'DELETE', cookie: guest.authCookie })).response.status, 204, '공유 여행을 지우지 않고 계정 삭제');
  const accessAfterGuestDelete = await api(`/api/trips/${tripId}/access`, { token: ownerToken });
  assert.ok(accessAfterGuestDelete.data.members.every(member => member.display_name !== '초대 계정'), '탈퇴 계정 표시명 비식별화');

  const blockedDelete = await api('/api/auth/account', { method: 'DELETE', cookie: first.authCookie });
  assert.equal(blockedDelete.response.status, 409, '소유 여행이 있는 계정 삭제 차단');
  assert.equal(blockedDelete.data.ownedTrips[0].id, tripId, '삭제 차단 원인 여행 반환');

  const recovery = await api(`/api/trips/${tripId}/recovery-key`, { method: 'POST', token: ownerToken, body: {} });
  const rescue = await login({ sub: 'rescue-google-id', name: '복구 계정', email: 'rescue@example.test', deviceName: '복구 기기' });
  const needsConfirmation = await api('/api/recovery/redeem', { method: 'POST', cookie: rescue.authCookie, body: { tripId, recoveryKey: recovery.data.recoveryKey, deviceId: 'rescue', deviceName: '복구 기기', platform: 'Test', clientType: 'browser' } });
  assert.equal(needsConfirmation.response.status, 409, '다른 계정으로 긴급 복구 시 확인 요구');
  assert.equal(needsConfirmation.data.confirmationRequired, true, '계정 이전 확인 플래그 반환');
  const recovered = await api('/api/recovery/redeem', { method: 'POST', cookie: rescue.authCookie, body: { tripId, recoveryKey: recovery.data.recoveryKey, confirmTransfer: true, deviceId: 'rescue', deviceName: '복구 기기', platform: 'Test', clientType: 'browser' } });
  assert.equal(recovered.response.status, 201, '확인 후 현재 계정으로 긴급 복구');
  assert.equal(recovered.data.accountLinked, true, '복구 membership 현재 계정 연결');
  assert.equal((await api(`/api/trips/${tripId}`, { token: ownerToken })).response.status, 200, '계정 이전 후에도 기존 기기 접근 호환');
  assert.equal((await api('/api/auth/trips', { cookie: first.authCookie })).data.trips.length, 0, '이전 계정의 여행 목록에서 제거');
  assert.equal((await api('/api/auth/account', { method: 'DELETE', cookie: first.authCookie })).response.status, 204, '소유권이 없는 이전 계정 삭제');
  assert.equal((await api('/api/auth/account', { method: 'DELETE', cookie: rescue.authCookie })).response.status, 409, '긴급 복구한 소유 계정 삭제 차단');

  const privacy = await fetch(base + '/privacy');
  assert.equal(privacy.status, 200, '공개 개인정보 처리방침 경로');
  assert.match(await privacy.text(), /개인정보 처리방침/, '개인정보 처리방침 본문');
  const terms = await fetch(base + '/terms');
  assert.equal(terms.status, 200, '공개 이용약관 경로');
  assert.match(await terms.text(), /이용약관/, '이용약관 본문');

  console.log('auth.integration: all assertions passed');
} catch (error) {
  console.error(workerLog);
  throw error;
} finally {
  worker.kill('SIGTERM');
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(worker.pid), '/t', '/f'], { stdio: 'ignore' });
  await new Promise(resolve => provider.close(resolve));
}
