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
  const created = await call('/api/trips', { method: 'POST', body: { trip, displayName: '배포 검증' } });
  assert.equal(created.response.status, 201); owner = created.data.accessToken;
  const invite = await call(`/api/trips/${id}/invites`, { method: 'POST', token: owner, body: { role: 'viewer', singleUse: true } });
  assert.equal(invite.response.status, 201);
  assert.equal((await call('/api/invites/redeem', { method: 'POST', body: { token: invite.data.token } })).response.status, 201);
  assert.ok([404, 409].includes((await call('/api/invites/redeem', { method: 'POST', body: { token: invite.data.token } })).response.status));
  const changed = structuredClone(trip); changed.note = '첫 번째 저장';
  assert.equal((await call(`/api/trips/${id}`, { method: 'PUT', token: owner, body: { trip: changed, baseRevision: 1 } })).response.status, 200);
  const conflict = await call(`/api/trips/${id}`, { method: 'PUT', token: owner, body: { trip, baseRevision: 1 } });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.data.trip.note, '첫 번째 저장');
  console.log('production sync smoke passed');
} finally {
  if (owner) await call(`/api/trips/${id}`, { method: 'DELETE', token: owner });
}

