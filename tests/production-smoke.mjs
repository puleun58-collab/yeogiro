import assert from 'node:assert/strict';

const base = process.env.YEOGIRO_BASE_URL || 'https://yeogiro.puleun58.workers.dev';
const id = `smoke_${Date.now()}`;
const trip = { id, title: '배포 검증 여행', start: '2026-08-22', end: '2026-08-23', note: '', cities: ['서울'], heroFileId: '', items: [], flights: [], lodgings: [], files: [] };
async function call(path, { method = 'GET', token = '', body } = {}) {
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await response.json(); } catch {}
  return { response, data };
}

let owner = '';
try {
  const created = await call('/api/trips', { method: 'POST', body: { trip, displayName: '배포 검증', deviceId: 'smoke-owner', deviceName: '운영 검증 PC', platform: 'Windows', clientType: 'browser' } });
  assert.equal(created.response.status, 201); owner = created.data.accessToken;
  const multiInvite = await call(`/api/trips/${id}/invites`, { method: 'POST', token: owner, body: { role: 'editor', singleUse: false, expiresInDays: 1 } });
  assert.equal(multiInvite.response.status, 201);
  const editorJoin = await call('/api/invites/redeem', { method: 'POST', body: { token: multiInvite.data.token, displayName: '운영 편집자', deviceId: 'smoke-editor' } });
  assert.equal(editorJoin.response.status, 201);
  assert.equal((await call('/api/invites/redeem', { method: 'POST', body: { token: multiInvite.data.token, displayName: '두 번째 편집자', deviceId: 'smoke-editor-2' } })).response.status, 201);
  const singleInvite = await call(`/api/trips/${id}/invites`, { method: 'POST', token: owner, body: { role: 'viewer', singleUse: true, expiresInDays: 1 } });
  assert.equal(singleInvite.response.status, 201);
  const viewerJoin = await call('/api/invites/redeem', { method: 'POST', body: { token: singleInvite.data.token, displayName: '운영 보기 전용', deviceId: 'smoke-viewer' } });
  assert.equal(viewerJoin.response.status, 201);
  assert.ok([404, 409].includes((await call('/api/invites/redeem', { method: 'POST', body: { token: singleInvite.data.token } })).response.status));
  const editorAccess = await call(`/api/trips/${id}/access`, { token: editorJoin.data.accessToken });
  assert.equal(editorAccess.response.status, 200);
  assert.equal(editorAccess.data.canManage, false);
  assert.deepEqual(editorAccess.data.invites, []);
  assert.equal((await call(`/api/trips/${id}/invites`, { method: 'POST', token: editorJoin.data.accessToken, body: { role: 'viewer' } })).response.status, 403);
  assert.equal((await call(`/api/trips/${id}`, { method: 'PUT', token: viewerJoin.data.accessToken, body: { trip, baseRevision: 1 } })).response.status, 403);
  const recovery = await call(`/api/trips/${id}/recovery-key`, { method: 'POST', token: owner, body: {} });
  assert.equal(recovery.response.status, 201);
  const recovered = await call('/api/recovery/redeem', { method: 'POST', body: { tripId: id, recoveryKey: recovery.data.recoveryKey, deviceId: 'smoke-recovered', deviceName: '복구 검증 기기', platform: 'iOS', clientType: 'pwa' } });
  assert.equal(recovered.response.status, 201);
  assert.equal((await call(`/api/trips/${id}`, { token: owner })).response.status, 200);
  assert.equal((await call(`/api/trips/${id}/sessions/${recovered.data.sessionId}`, { method: 'DELETE', token: owner })).response.status, 200);
  assert.equal((await call(`/api/trips/${id}`, { token: recovered.data.accessToken })).response.status, 401);
  const changed = structuredClone(trip); changed.note = '첫 번째 저장';
  assert.equal((await call(`/api/trips/${id}`, { method: 'PUT', token: owner, body: { trip: changed, baseRevision: 1 } })).response.status, 200);
  const conflict = await call(`/api/trips/${id}`, { method: 'PUT', token: owner, body: { trip, baseRevision: 1 } });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.data.trip.note, '첫 번째 저장');
  console.log('production multi-device, permissions, recovery and sync smoke passed');
} finally {
  if (owner) await call(`/api/trips/${id}`, { method: 'DELETE', token: owner });
}
