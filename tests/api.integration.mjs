import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

const port = 8791;
const base = `http://127.0.0.1:${port}`;
const persist = '.wrangler/test-state';
const npmCommand = 'npx';
const runIp = `test-${process.pid}-${Date.now()}`;
const quote = value => /[\s"]/u.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
const commandLine = args => [npmCommand, 'wrangler', ...args].map(quote).join(' ');

function wrangler(args) {
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', commandLine(args)], { encoding: 'utf8' })
    : spawnSync(npmCommand, ['wrangler', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || 'wrangler command failed');
  return result.stdout;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { const response = await fetch(base); if (response.status < 500) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('local Worker did not start');
}

async function api(path, { method = 'GET', token = '', body, headers = {} } = {}) {
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has('CF-Connecting-IP')) requestHeaders.set('CF-Connecting-IP', runIp);
  if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
  if (body && !(body instanceof FormData)) requestHeaders.set('Content-Type', 'application/json');
  const response = await fetch(base + path, { method, headers: requestHeaders, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await response.json(); } catch {}
  return { response, data };
}

function trip(id) {
  return { id, title: '통합 테스트 여행', start: '2026-08-22', end: '2026-08-24', note: '', cities: ['서울'], heroFileId: '', items: [{ id: `${id}_item`, day: '2026-08-22', time: '10:00', endTime: '11:15', preparationMinutes: 20, cat: '명소', name: '테스트 일정', place: '', mapUrl: '', memo: '', move: '도보', alarm: '', lat: null, lng: null, userDocs: [] }], flights: [], lodgings: [], files: [] };
}

wrangler(['d1', 'migrations', 'apply', 'yeogiro-db', '--local', '--persist-to', persist]);
const server = process.platform === 'win32'
  ? spawn('cmd.exe', ['/d', '/s', '/c', commandLine(['dev', '--local', '--port', String(port), '--persist-to', persist])], { stdio: ['ignore', 'pipe', 'pipe'] })
  : spawn(npmCommand, ['wrangler', 'dev', '--local', '--port', String(port), '--persist-to', persist], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk; });
server.stderr.on('data', chunk => { serverLog += chunk; });

try {
  await waitForServer();
  const id = `test_${Date.now()}`;

  const created = await api('/api/trips', { method: 'POST', body: { trip: trip(id), displayName: '테스트 소유자', deviceId: 'owner-device', deviceName: 'Windows', platform: 'Windows', clientType: 'browser' } });
  assert.equal(created.response.status, 201, '여행 생성 성공');
  assert.equal(created.data.role, 'owner', 'owner 권한 정상');
  assert.deepEqual({ endTime: created.data.trip.items[0].endTime, preparationMinutes: created.data.trip.items[0].preparationMinutes }, { endTime: '11:15', preparationMinutes: 20 }, '일정 종료·준비시간 저장 및 조회');
  const owner = created.data.accessToken;
  assert.ok(created.data.sessionId, '여행 생성 시 기기 세션 발급');

  const invalid = await api(`/api/trips/${id}`, { token: 'not-a-valid-token' });
  assert.equal(invalid.response.status, 401, '잘못된 access token 거부');

  const editorInvite = await api(`/api/trips/${id}/invites`, { method: 'POST', token: owner, body: { role: 'editor', singleUse: false } });
  const editorJoin = await api('/api/invites/redeem', { method: 'POST', body: { token: editorInvite.data.token, displayName: '편집자' } });
  assert.equal(editorJoin.response.status, 201, 'editor 초대 및 참여');
  const editor = editorJoin.data.accessToken;

  const viewerInvite = await api(`/api/trips/${id}/invites`, { method: 'POST', token: owner, body: { role: 'viewer', singleUse: true } });
  const viewerJoin = await api('/api/invites/redeem', { method: 'POST', body: { token: viewerInvite.data.token, displayName: '뷰어' } });
  assert.equal(viewerJoin.response.status, 201, 'viewer 초대 및 참여');
  const viewer = viewerJoin.data.accessToken;
  const reused = await api('/api/invites/redeem', { method: 'POST', body: { token: viewerInvite.data.token } });
  assert.ok([404, 409].includes(reused.response.status), '1회용 초대 재사용 거부');

  const accessBefore = await api(`/api/trips/${id}/access`, { token: owner });
  const ownerMember = accessBefore.data.members.find(member => member.role === 'owner');
  const editorMember = accessBefore.data.members.find(member => member.role === 'editor');
  const viewerMember = accessBefore.data.members.find(member => member.role === 'viewer');
  assert.ok(accessBefore.data.sessions.some(session => session.id === created.data.sessionId && session.current), '현재 기기 세션 표시');

  const issued = await api(`/api/trips/${id}/recovery-key`, { method: 'POST', token: owner, body: {} });
  assert.equal(issued.response.status, 201, 'owner 복구키 생성');
  assert.match(issued.data.recoveryKey, /^(?:[A-Z2-9]{4}-){4}[A-Z2-9]{4}$/, '복구키 보관 형식');
  assert.ok(!issued.data.recoveryUrl.includes(issued.data.recoveryKey), '복구 URL에 복구키 미포함');
  const firstRecoveryKey = issued.data.recoveryKey;

  const badRecovery = await api('/api/recovery/redeem', { method: 'POST', body: { tripId: id, recoveryKey: 'AAAA-BBBB-CCCC-DDDD-EEEE', deviceId: 'bad-device' } });
  assert.equal(badRecovery.response.status, 401, '잘못된 복구키 거부');
  const recovered = await api('/api/recovery/redeem', { method: 'POST', body: { tripId: id, recoveryKey: firstRecoveryKey, deviceId: 'new-phone', deviceName: '새 휴대폰', platform: 'iOS', clientType: 'pwa' } });
  assert.equal(recovered.response.status, 201, '올바른 복구키로 owner 세션 생성');
  assert.equal(recovered.data.role, 'owner');
  const recoveredToken = recovered.data.accessToken;

  const rotated = await api(`/api/trips/${id}/recovery-key`, { method: 'POST', token: owner, body: {} });
  assert.equal(rotated.response.status, 201, '복구키 재발급');
  assert.notEqual(rotated.data.recoveryKey, firstRecoveryKey, '새 복구키 원문 변경');
  const oldRecovery = await api('/api/recovery/redeem', { method: 'POST', body: { tripId: id, recoveryKey: firstRecoveryKey, deviceId: 'old-key-device' } });
  assert.equal(oldRecovery.response.status, 401, '재발급 후 이전 복구키 사용 불가');
  const recoveredAgain = await api('/api/recovery/redeem', { method: 'POST', body: { tripId: id, recoveryKey: rotated.data.recoveryKey, deviceId: 'replacement-phone', deviceName: '교체 휴대폰', platform: 'Android', clientType: 'pwa' } });
  assert.equal(recoveredAgain.response.status, 201, '새 복구키 사용 가능');

  const revokedSession = await api(`/api/trips/${id}/sessions/${recovered.data.sessionId}`, { method: 'DELETE', token: owner });
  assert.equal(revokedSession.response.status, 200, '특정 기기 세션 해제');
  assert.equal((await api(`/api/trips/${id}`, { token: recoveredToken })).response.status, 401, 'revoked session은 즉시 401');
  assert.equal((await api(`/api/trips/${id}/access`, { token: editor })).response.status, 403, 'editor는 기기·멤버 관리 불가');
  assert.equal((await api(`/api/trips/${id}/recovery-key`, { method: 'POST', token: editor, body: {} })).response.status, 403, 'editor는 복구키 재발급 불가');
  assert.equal((await api(`/api/trips/${id}/sessions/${created.data.sessionId}`, { method: 'DELETE', token: editor })).response.status, 403, 'editor는 세션 해제 불가');

  assert.equal((await api(`/api/trips/${id}/members/${viewerMember.id}`, { method: 'PATCH', token: owner, body: { role: 'editor' } })).data.role, 'editor', 'viewer를 editor로 변경');
  assert.equal((await api(`/api/trips/${id}/members/${viewerMember.id}`, { method: 'PATCH', token: owner, body: { role: 'viewer' } })).data.role, 'viewer', 'editor를 viewer로 변경');

  const disposableInvite = await api(`/api/trips/${id}/invites`, { method: 'POST', token: owner, body: { role: 'editor', singleUse: true } });
  const disposableJoin = await api('/api/invites/redeem', { method: 'POST', body: { token: disposableInvite.data.token, displayName: '제거할 편집자', deviceId: 'disposable' } });
  const disposableAccess = await api(`/api/trips/${id}/access`, { token: owner });
  const disposableMember = disposableAccess.data.members.find(member => member.display_name === '제거할 편집자');
  assert.equal((await api(`/api/trips/${id}/members/${disposableMember.id}`, { method: 'DELETE', token: owner })).response.status, 204, 'owner가 editor 제거 가능');
  assert.equal((await api(`/api/trips/${id}`, { token: disposableJoin.data.accessToken })).response.status, 401, '멤버 제거 시 해당 세션 해제');

  const viewerEdit = await api(`/api/trips/${id}`, { method: 'PUT', token: viewer, body: { trip: trip(id), baseRevision: 1 } });
  assert.equal(viewerEdit.response.status, 403, 'viewer 수정 시 403');

  const editedTrip = trip(id); editedTrip.note = '편집자 변경';
  const editorEdit = await api(`/api/trips/${id}`, { method: 'PUT', token: editor, body: { trip: editedTrip, baseRevision: 1 } });
  assert.equal(editorEdit.response.status, 200, 'editor 수정 성공');

  const conflict = await api(`/api/trips/${id}`, { method: 'PUT', token: owner, body: { trip: trip(id), baseRevision: 1 } });
  assert.equal(conflict.response.status, 409, 'revision 충돌 시 409');
  assert.equal(conflict.data.trip.revision, 2, '충돌 응답에 최신 trip 포함');

  const impossibleDate = trip(id); impossibleDate.items[0].day = '2026-02-30';
  assert.equal((await api(`/api/trips/${id}`, { method: 'PUT', token: owner, body: { trip: impossibleDate, baseRevision: 2 } })).response.status, 400, '존재하지 않는 날짜 차단');
  const reversedFlight = trip(id); reversedFlight.flights.push({ id: `${id}_flight`, airline: '', flightNumber: 'TW125', departDate: '2026-08-23', arriveDate: '2026-08-22', from: 'ICN', fromTerminal: '', fromCity: '인천', depart: '23:30', to: 'DAD', toTerminal: '', toCity: '다낭', arrive: '02:10', reservationNumber: '', seat: '', baggage: '', userDocs: [] });
  assert.equal((await api(`/api/trips/${id}`, { method: 'PUT', token: owner, body: { trip: reversedFlight, baseRevision: 2 } })).response.status, 400, '출발일보다 빠른 도착일 차단');
  const missingTarget = trip(id); missingTarget.files.push({ id: `${id}_file`, entityType: 'flight', entityId: 'deleted-flight', name: 'missing.pdf', mime: 'application/pdf', size: 10, deviceId: 'test-device' });
  assert.equal((await api(`/api/trips/${id}`, { method: 'PUT', token: owner, body: { trip: missingTarget, baseRevision: 2 } })).response.status, 400, '삭제된 문서 연결 대상 차단');

  const revokedInvite = await api(`/api/trips/${id}/invites`, { method: 'POST', token: owner, body: { role: 'viewer', singleUse: false } });
  await api(`/api/trips/${id}/invites/${revokedInvite.data.id}`, { method: 'DELETE', token: owner });
  const revoked = await api('/api/invites/redeem', { method: 'POST', body: { token: revokedInvite.data.token } });
  assert.equal(revoked.response.status, 404, 'revoke된 invite 거부');

  const expiredInvite = await api(`/api/trips/${id}/invites`, { method: 'POST', token: owner, body: { role: 'viewer', singleUse: false, expiresInSeconds: 1 } });
  await new Promise(resolve => setTimeout(resolve, 1100));
  const expired = await api('/api/invites/redeem', { method: 'POST', body: { token: expiredInvite.data.token } });
  assert.equal(expired.response.status, 404, '만료된 invite 거부');

  const transferred = await api(`/api/trips/${id}/members/${editorMember.id}/transfer`, { method: 'POST', token: owner, body: { previousOwner: 'editor' } });
  assert.equal(transferred.response.status, 200, '소유권 이전 성공');
  assert.equal(transferred.data.previousOwnerRole, 'editor', '이전 owner를 editor로 변경');
  assert.equal((await api(`/api/trips/${id}`, { token: editor })).data.role, 'owner', '대상 editor가 owner로 승격');
  assert.equal((await api(`/api/trips/${id}`, { token: owner })).data.role, 'editor', '이전 owner 세션 권한도 editor 반영');
  assert.equal((await api(`/api/trips/${id}/members/${editorMember.id}`, { method: 'DELETE', token: editor })).response.status, 409, '마지막 owner 삭제 차단');

  const oversized = new FormData(); oversized.append('file', new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: 'application/pdf' }), 'large.pdf');
  assert.equal((await api('/api/analyze-document', { method: 'POST', body: oversized })).response.status, 413, 'AI 분석 8MB 초과 차단');
  const badMime = new FormData(); badMime.append('file', new Blob(['text'], { type: 'text/plain' }), 'bad.txt');
  assert.equal((await api('/api/analyze-document', { method: 'POST', body: badMime })).response.status, 415, '잘못된 MIME 차단');
  const badMagic = new FormData(); badMagic.append('file', new Blob(['not a pdf'], { type: 'application/pdf' }), 'fake.pdf');
  assert.equal((await api('/api/analyze-document', { method: 'POST', body: badMagic })).response.status, 415, 'magic number 불일치 차단');

  let limited;
  for (let i = 0; i < 31; i += 1) limited = await api('/api/trips', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.77' }, body: {} });
  assert.equal(limited.response.status, 429, 'rate limit 정상 동작');

  let recoveryLimited;
  for (let i = 0; i < 9; i += 1) recoveryLimited = await api('/api/recovery/redeem', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.88' }, body: { tripId: id, recoveryKey: 'AAAA-BBBB-CCCC-DDDD-EEEE' } });
  assert.equal(recoveryLimited.response.status, 429, '복구 API rate limit');

  await api(`/api/trips/${id}`, { method: 'DELETE', token: editor });
  console.log('37 API integration checks passed');
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
  else server.kill('SIGTERM');
}
