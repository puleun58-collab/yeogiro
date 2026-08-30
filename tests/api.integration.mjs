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
  return { id, title: '통합 테스트 여행', start: '2026-08-22', end: '2026-08-24', note: '', cities: ['서울'], heroFileId: '', items: [{ id: `${id}_item`, day: '2026-08-22', time: '10:00', endTime: '11:15', preparationMinutes: 20, fixed: true, moveMinutes: 35, cat: '명소', name: '테스트 일정', place: '', mapUrl: '', memo: '', move: '도보', alarm: '', lat: null, lng: null, userDocs: [] }], flights: [], lodgings: [], files: [] };
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
  assert.deepEqual({ fixed: created.data.trip.items[0].fixed, moveMinutes: created.data.trip.items[0].moveMinutes }, { fixed: true, moveMinutes: 35 }, '고정 일정과 수동 이동시간 저장 및 조회');
  const owner = created.data.accessToken;
  assert.ok(created.data.sessionId, '여행 생성 시 기기 세션 발급');
  const createdActivity = await api(`/api/trips/${id}/activity`, { token: owner });
  assert.ok(createdActivity.data.activities.some(entry => entry.action === 'created' && entry.entity_type === 'trip'), '여행 생성 활동 기록');

  const invalid = await api(`/api/trips/${id}`, { token: 'not-a-valid-token' });
  assert.equal(invalid.response.status, 401, '잘못된 access token 거부');

  const editorInvite = await api(`/api/trips/${id}/invites`, { method: 'POST', token: owner, body: { role: 'editor', singleUse: false } });
  const editorJoin = await api('/api/invites/redeem', { method: 'POST', body: { token: editorInvite.data.token, displayName: '편집자' } });
  assert.equal(editorJoin.response.status, 201, 'editor 초대 및 참여');
  const editor = editorJoin.data.accessToken;
  const editorPreview = await api('/api/invites/preview', { method: 'POST', body: { token: editorInvite.data.token } });
  assert.equal(editorPreview.response.status, 200, '초대 참여 전 여행 ID 확인');
  assert.equal(editorPreview.data.tripId, id, '초대 중복 확인용 여행 ID 반환');

  const viewerInvite = await api(`/api/trips/${id}/invites`, { method: 'POST', token: owner, body: { role: 'viewer', singleUse: true } });
  const viewerJoin = await api('/api/invites/redeem', { method: 'POST', body: { token: viewerInvite.data.token, displayName: '뷰어' } });
  assert.equal(viewerJoin.response.status, 201, 'viewer 초대 및 참여');
  const viewer = viewerJoin.data.accessToken;
  const reused = await api('/api/invites/redeem', { method: 'POST', body: { token: viewerInvite.data.token } });
  assert.ok([404, 409].includes(reused.response.status), '1회용 초대 재사용 거부');

  const editorSelf = await api(`/api/trips/${id}/me`, { token: editor });
  assert.equal(editorSelf.response.status, 200, '모든 권한이 내 공유 정보 조회 가능');
  assert.equal(editorSelf.data.member.role, 'editor', '내 실제 권한 반환');
  assert.ok(editorSelf.data.sessions.every(item => item.id === editorJoin.data.sessionId), '내 기기만 반환');
  const renamedEditor = await api(`/api/trips/${id}/me`, { method: 'PATCH', token: editor, body: { displayName: '여행 친구' } });
  assert.equal(renamedEditor.data.displayName, '여행 친구', '표시명 변경');
  assert.equal((await api(`/api/trips/${id}/me`, { method: 'PATCH', token: editor, body: { displayName: '   ' } })).response.status, 400, '빈 표시명 거부');

  const deviceCode = await api(`/api/trips/${id}/me/device-code`, { method: 'POST', token: editor, body: {} });
  assert.equal(deviceCode.response.status, 201, '편집자도 새 기기 연결 코드 생성');
  assert.match(deviceCode.data.code, /^(?:[A-Z2-9]{4}-){3}[A-Z2-9]{4}$/, '기기 연결 코드 표시 형식');
  assert.ok(!deviceCode.data.connectUrl.includes(deviceCode.data.code), '연결 URL에 코드 원문 미포함');
  const badDeviceCode = await api('/api/device-links/redeem', { method: 'POST', body: { tripId: id, code: 'AAAA-BBBB-CCCC-DDDD' } });
  assert.equal(badDeviceCode.response.status, 401, '잘못된 기기 연결 코드 거부');
  const linkedEditor = await api('/api/device-links/redeem', { method: 'POST', body: { tripId: id, code: deviceCode.data.code, deviceId: 'editor-second', deviceName: '여행용 iPad', platform: 'iOS', clientType: 'pwa' } });
  assert.equal(linkedEditor.response.status, 201, '새 기기에 기존 구성원 세션 생성');
  assert.equal(linkedEditor.data.role, 'editor', '새 기기에서도 권한 상승 없음');
  assert.equal((await api('/api/device-links/redeem', { method: 'POST', body: { tripId: id, code: deviceCode.data.code } })).response.status, 401, '1회용 기기 연결 코드 재사용 거부');
  assert.equal((await api(`/api/trips/${id}/sessions/${linkedEditor.data.sessionId}`, { method: 'DELETE', token: editor })).response.status, 200, '편집자가 본인 다른 기기 연결 해제');
  assert.equal((await api(`/api/trips/${id}`, { token: linkedEditor.data.accessToken })).response.status, 401, '해제된 본인 기기 세션 즉시 401');
  assert.equal((await api(`/api/trips/${id}/me`, { method: 'DELETE', token: owner })).response.status, 409, '여행 관리자는 관리자 넘기기 전 나가기 차단');

  const leavingInvite = await api(`/api/trips/${id}/invites`, { method: 'POST', token: owner, body: { role: 'viewer', singleUse: true } });
  const leavingJoin = await api('/api/invites/redeem', { method: 'POST', body: { token: leavingInvite.data.token, displayName: '나갈 사람' } });
  assert.equal((await api(`/api/trips/${id}/me`, { method: 'DELETE', token: leavingJoin.data.accessToken })).response.status, 204, '공유 구성원 스스로 나가기');
  assert.equal((await api(`/api/trips/${id}`, { token: leavingJoin.data.accessToken })).response.status, 401, '나간 구성원의 모든 세션 무효화');

  const accessBefore = await api(`/api/trips/${id}/access`, { token: owner });
  const ownerMember = accessBefore.data.members.find(member => member.role === 'owner');
  const editorMember = accessBefore.data.members.find(member => member.role === 'editor');
  const viewerMember = accessBefore.data.members.find(member => member.role === 'viewer');
  assert.ok(accessBefore.data.sessions.some(session => session.id === created.data.sessionId && session.current), '현재 기기 세션 표시');

  const renamedOwnerSession = await api(`/api/trips/${id}/sessions/${created.data.sessionId}`, { method: 'PATCH', token: owner, body: { deviceName: '집 컴퓨터' } });
  assert.equal(renamedOwnerSession.response.status, 200, '본인 기기 이름 변경 가능');
  assert.equal(renamedOwnerSession.data.deviceName, '집 컴퓨터', '변경한 기기 이름 반환');
  const ownerAccessAfterRename = await api(`/api/trips/${id}/access`, { token: owner });
  assert.equal(ownerAccessAfterRename.data.sessions.find(session => session.id === created.data.sessionId).device_name, '집 컴퓨터', '기기 이름을 세션에 저장');
  const resetOwnerSession = await api(`/api/trips/${id}/sessions/${created.data.sessionId}`, { method: 'PATCH', token: owner, body: { deviceName: '   ' } });
  assert.equal(resetOwnerSession.data.deviceName, 'Windows', '빈 이름은 감지된 플랫폼 이름으로 복원');
  assert.equal((await api(`/api/trips/${id}/sessions/${editorJoin.data.sessionId}`, { method: 'PATCH', token: editor, body: { deviceName: '내 iPad' } })).response.status, 200, 'editor도 본인 기기 이름 변경 가능');
  assert.equal((await api(`/api/trips/${id}/sessions/${created.data.sessionId}`, { method: 'PATCH', token: editor, body: { deviceName: '다른 사람 기기' } })).response.status, 403, '다른 사람 기기 이름 변경 거부');

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
  const editorAccess = await api(`/api/trips/${id}/access`, { token: editor });
  assert.equal(editorAccess.response.status, 200, 'editor도 참여자 목록 확인 가능');
  assert.equal(editorAccess.data.canManage, false, 'editor 관리 기능 비활성');
  assert.ok(editorAccess.data.members.length >= 3, 'editor 응답에 참여자 목록 포함');
  assert.deepEqual(editorAccess.data.invites, [], 'editor에게 초대 관리 정보 비공개');
  assert.deepEqual(editorAccess.data.sessions, [], 'editor에게 다른 기기 세션 정보 비공개');
  const viewerAccess = await api(`/api/trips/${id}/access`, { token: viewer });
  assert.equal(viewerAccess.response.status, 200, 'viewer도 참여자 목록 확인 가능');
  assert.equal(viewerAccess.data.canManage, false, 'viewer 관리 기능 비활성');
  assert.equal((await api(`/api/trips/${id}/recovery-key`, { method: 'POST', token: editor, body: {} })).response.status, 403, 'editor는 복구키 재발급 불가');
  assert.equal((await api(`/api/trips/${id}/sessions/${created.data.sessionId}`, { method: 'DELETE', token: editor })).response.status, 403, 'editor는 세션 해제 불가');
  assert.equal((await api(`/api/trips/${id}/invites`, { method: 'POST', token: viewer, body: { role: 'editor' } })).response.status, 403, 'viewer 초대 생성 API 거부');
  assert.equal((await api(`/api/trips/${id}/members/${editorMember.id}`, { method: 'PATCH', token: viewer, body: { role: 'viewer' } })).response.status, 403, 'viewer 권한 관리 API 거부');
  assert.equal((await api(`/api/trips/${id}/members/${editorMember.id}`, { method: 'DELETE', token: viewer })).response.status, 403, 'viewer 참여자 제거 API 거부');

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
  assert.ok(Array.isArray(conflict.data.changes) && conflict.data.changes.length, '충돌 응답에 변경 항목 비교 제공');

  const impossibleDate = trip(id); impossibleDate.items[0].day = '2026-02-30';
  assert.equal((await api(`/api/trips/${id}`, { method: 'PUT', token: owner, body: { trip: impossibleDate, baseRevision: 2 } })).response.status, 400, '존재하지 않는 날짜 차단');
  const reversedFlight = trip(id); reversedFlight.flights.push({ id: `${id}_flight`, airline: '', flightNumber: 'TW125', departDate: '2026-08-23', arriveDate: '2026-08-22', from: 'ICN', fromTerminal: '', fromCity: '인천', depart: '23:30', to: 'DAD', toTerminal: '', toCity: '다낭', arrive: '02:10', reservationNumber: '', seat: '', baggage: '', userDocs: [] });
  assert.equal((await api(`/api/trips/${id}`, { method: 'PUT', token: owner, body: { trip: reversedFlight, baseRevision: 2 } })).response.status, 400, '출발일보다 빠른 도착일 차단');
  const missingTarget = trip(id); missingTarget.files.push({ id: `${id}_file`, entityType: 'flight', entityId: 'deleted-flight', name: 'missing.pdf', mime: 'application/pdf', size: 10, deviceId: 'test-device' });
  assert.equal((await api(`/api/trips/${id}`, { method: 'PUT', token: owner, body: { trip: missingTarget, baseRevision: 2 } })).response.status, 400, '삭제된 문서 연결 대상 차단');

  const withoutItem = structuredClone(editedTrip); withoutItem.items = [];
  const deletedItem = await api(`/api/trips/${id}`, { method: 'PUT', token: editor, body: { trip: withoutItem, baseRevision: 2 } });
  assert.equal(deletedItem.response.status, 200, '일정 삭제 동기화 성공');
  const trash = await api(`/api/trips/${id}/trash`, { token: owner });
  assert.equal(trash.response.status, 200, '권한 있는 구성원이 휴지통 조회');
  assert.equal(trash.data.trash[0].entity_type, 'item', '삭제 일정이 휴지통에 보관');
  assert.ok(!('snapshot_json' in trash.data.trash[0]), '휴지통 목록에서 민감한 스냅샷 비노출');
  const activity = await api(`/api/trips/${id}/activity`, { token: viewer });
  assert.equal(activity.response.status, 200, '보기 전용도 최근 변경 확인 가능');
  assert.ok(activity.data.activities.some(entry => entry.action === 'deleted' && entry.entity_type === 'item'), '삭제 활동과 수정자 기록');
  assert.ok(activity.data.activities.some(entry => entry.details?.category === 'member' && entry.action === 'created'), '구성원 참여를 기존 감사 로그 구조에 기록');
  assert.ok(activity.data.activities.some(entry => entry.details?.category === 'member' && entry.action === 'updated'), '내 이름 변경을 기존 감사 로그 구조에 기록');
  assert.ok(activity.data.activities.some(entry => entry.details?.category === 'access' && entry.action === 'updated'), '공유 권한 변경을 기존 감사 로그 구조에 기록');
  assert.ok(activity.data.activities.some(entry => entry.details?.category === 'member' && entry.action === 'deleted'), '구성원 제외를 기존 감사 로그 구조에 기록');
  assert.ok(activity.data.activities.every(entry => !entry.snapshot_json), '활동 내역에 삭제 스냅샷 비노출');
  assert.equal((await api(`/api/trips/${id}/trash/${trash.data.trash[0].id}/restore`, { method: 'POST', token: viewer, body: {} })).response.status, 403, '보기 전용 휴지통 복원 차단');
  const restoredItem = await api(`/api/trips/${id}/trash/${trash.data.trash[0].id}/restore`, { method: 'POST', token: editor, body: {} });
  assert.equal(restoredItem.response.status, 200, '편집 가능한 구성원이 삭제 일정 복원');
  assert.ok(restoredItem.data.trip.items.some(item => item.id === `${id}_item`), '복원 후 기존 일정 ID와 내용 유지');
  assert.equal((await api(`/api/trips/${id}/trash/${trash.data.trash[0].id}/restore`, { method: 'POST', token: editor, body: {} })).response.status, 404, '같은 휴지통 항목 중복 복원 차단');
  const withDocument = structuredClone(restoredItem.data.trip), documentId = `${id}_document`;
  withDocument.files.push({ id: documentId, entityType: 'item', entityId: `${id}_item`, name: '예약서.pdf', mime: 'application/pdf', size: 120, deviceId: 'test-device' });
  const documentAdded = await api(`/api/trips/${id}`, { method: 'PUT', token: editor, body: { trip: withDocument, baseRevision: 4 } });
  assert.equal(documentAdded.response.status, 200, '예약 서류 메타데이터 추가 기록');
  const withoutDocument = structuredClone(documentAdded.data.trip); withoutDocument.files = withoutDocument.files.filter(file => file.id !== documentId);
  const documentDeleted = await api(`/api/trips/${id}`, { method: 'PUT', token: editor, body: { trip: withoutDocument, baseRevision: 5 } });
  assert.equal(documentDeleted.response.status, 200, '예약 서류 삭제 기록');
  const documentTrash = await api(`/api/trips/${id}/trash`, { token: editor });
  const trashedDocument = documentTrash.data.trash.find(entry => entry.entity_id === documentId);
  assert.ok(trashedDocument && trashedDocument.entity_type === 'file', '삭제한 예약 서류 메타데이터를 휴지통에 보관');
  const documentRestored = await api(`/api/trips/${id}/trash/${trashedDocument.id}/restore`, { method: 'POST', token: editor, body: {} });
  assert.equal(documentRestored.response.status, 200, '예약 서류 메타데이터 복원');
  assert.ok(documentRestored.data.trip.files.some(file => file.id === documentId), '복원한 예약 서류가 기존 일정에 다시 연결');

  const expenseDraft = structuredClone(documentRestored.data.trip), expenseId = `${id}_expense`;
  expenseDraft.expenseSettings = { baseCurrency: 'KRW', budgetMinor: 150000, settledAt: '', settlementFingerprint: '' };
  expenseDraft.expenses.push({ id: expenseId, title: '함께 먹은 식사', category: '식비', amountMinor: 30000, currency: 'KRW', baseCurrency: 'KRW', rateMicros: 1000000, convertedMinor: 30000, rateUpdatedAt: '2026-08-22T10:00:00.000Z', rateSource: 'same-currency', paidByMemberId: ownerMember.id, shareMemberIds: [ownerMember.id, editorMember.id], spentAt: '2026-08-22', memo: '', linkedType: 'item', linkedId: `${id}_item` });
  const expenseAdded = await api(`/api/trips/${id}`, { method: 'PUT', token: editor, body: { trip: expenseDraft, baseRevision: documentRestored.data.trip.revision } });

  assert.equal(expenseAdded.response.status, 200, 'editor 경비 추가 가능');
  assert.equal(expenseAdded.data.trip.expenses[0].convertedMinor, 30000, '원금과 저장 환율 기준 환산액 유지');
  assert.deepEqual(new Set(expenseAdded.data.trip.expenses[0].shareMemberIds), new Set([ownerMember.id, editorMember.id]), '선택한 분담자 저장');
  const viewerExpenseEdit = structuredClone(expenseAdded.data.trip); viewerExpenseEdit.expenses[0].title = '차단 대상';
  assert.equal((await api(`/api/trips/${id}`, { method: 'PUT', token: viewer, body: { trip: viewerExpenseEdit, baseRevision: expenseAdded.data.trip.revision } })).response.status, 403, 'viewer 경비 수정 차단');
  const withoutExpense = structuredClone(expenseAdded.data.trip); withoutExpense.expenses = [];
  const expenseDeleted = await api(`/api/trips/${id}`, { method: 'PUT', token: owner, body: { trip: withoutExpense, baseRevision: expenseAdded.data.trip.revision } });
  assert.equal(expenseDeleted.response.status, 200, 'owner 경비 삭제 가능');
  const expenseTrash = await api(`/api/trips/${id}/trash`, { token: owner });
  const trashedExpense = expenseTrash.data.trash.find(entry => entry.entity_id === expenseId);
  assert.ok(trashedExpense && trashedExpense.entity_type === 'expense', '삭제 경비를 휴지통에 보관');
  const expenseRestored = await api(`/api/trips/${id}/trash/${trashedExpense.id}/restore`, { method: 'POST', token: editor, body: {} });
  assert.equal(expenseRestored.response.status, 200, '경비 복원 가능');
  assert.equal(expenseRestored.data.trip.expenses[0].title, '함께 먹은 식사', '경비 원본 정보 복원');
  assert.equal((await api('/api/weather')).response.status, 400, '날씨 API 위치 누락 차단');
  const sameRate = await api('/api/exchange-rate?from=KRW&to=KRW');
  assert.equal(sameRate.data.rateMicros, 1000000, '같은 통화는 환율 1로 응답');
  const ecbRate = await api('/api/exchange-rate?from=JPY&to=KRW');
  assert.equal(ecbRate.response.status, 200, 'ECB 지원 통화쌍 환율 조회');
  assert.ok(ecbRate.data.rateMicros > 0, 'ECB 환율은 양수 마이크로 단위');
  const fallbackRate = await api('/api/exchange-rate?from=VND&to=KRW');
  assert.equal(fallbackRate.response.status, 200, 'ECB 미지원 통화도 대체 소스로 조회');
  assert.ok(fallbackRate.data.rateMicros > 0, 'VND 환율도 마이크로 단위로 제공');
  assert.equal((await api('/api/exchange-rate?from=XXX&to=KRW')).response.status, 400, '지원하지 않는 통화 차단');
  const koreanCity = await api('/api/weather?city=' + encodeURIComponent('다낭'));
  assert.equal(koreanCity.response.status, 200, '한국어 도시명으로도 날씨 조회');
  assert.ok(Array.isArray(koreanCity.data.daily.time) && koreanCity.data.daily.time.length > 0, '날짜별 예보 배열 제공');
  assert.ok(koreanCity.data.timezone && koreanCity.data.fetchedAt, '현지 시간대와 기준 시각 제공');
  const homeCity = await api('/api/weather?city=' + encodeURIComponent('제주'));
  assert.equal(homeCity.data.timezone, 'Asia/Seoul', '동명 해외 도시가 아니라 실제 여행지 좌표를 사용');
  const drivingRoute = await api('/api/route?profile=driving&fromLat=35.7901&fromLng=129.3321&toLat=35.8367&toLng=129.2838');
  assert.equal(drivingRoute.response.status, 200, '자동차 경로를 Worker 경유로 조회');
  assert.ok(drivingRoute.data.routes?.[0]?.distance > 0 && drivingRoute.data.routes[0].duration > 0, '자동차 경로 거리와 이동시간 제공');
  assert.equal((await api('/api/route?profile=transit&fromLat=35.79&fromLng=129.33&toLat=35.83&toLng=129.28')).response.status, 400, '지원하지 않는 라우팅 프로필 차단');

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
  console.log('72 API integration checks passed');
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
  else server.kill('SIGTERM');
}
