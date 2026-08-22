import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

const port = 8791;
const base = `http://127.0.0.1:${port}`;
const persist = '.wrangler/test-state';
const npmCommand = 'npx';
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
  if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
  if (body && !(body instanceof FormData)) requestHeaders.set('Content-Type', 'application/json');
  const response = await fetch(base + path, { method, headers: requestHeaders, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await response.json(); } catch {}
  return { response, data };
}

function trip(id) {
  return { id, title: '통합 테스트 여행', start: '2026-08-22', end: '2026-08-24', note: '', cities: ['서울'], heroFileId: '', items: [], flights: [], lodgings: [], files: [] };
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

  const created = await api('/api/trips', { method: 'POST', body: { trip: trip(id), displayName: '테스트 소유자' } });
  assert.equal(created.response.status, 201, '여행 생성 성공');
  assert.equal(created.data.role, 'owner', 'owner 권한 정상');
  const owner = created.data.accessToken;

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

  const viewerEdit = await api(`/api/trips/${id}`, { method: 'PUT', token: viewer, body: { trip: trip(id), baseRevision: 1 } });
  assert.equal(viewerEdit.response.status, 403, 'viewer 수정 시 403');

  const editedTrip = trip(id); editedTrip.note = '편집자 변경';
  const editorEdit = await api(`/api/trips/${id}`, { method: 'PUT', token: editor, body: { trip: editedTrip, baseRevision: 1 } });
  assert.equal(editorEdit.response.status, 200, 'editor 수정 성공');

  const conflict = await api(`/api/trips/${id}`, { method: 'PUT', token: owner, body: { trip: trip(id), baseRevision: 1 } });
  assert.equal(conflict.response.status, 409, 'revision 충돌 시 409');
  assert.equal(conflict.data.trip.revision, 2, '충돌 응답에 최신 trip 포함');

  const revokedInvite = await api(`/api/trips/${id}/invites`, { method: 'POST', token: owner, body: { role: 'viewer', singleUse: false } });
  await api(`/api/trips/${id}/invites/${revokedInvite.data.id}`, { method: 'DELETE', token: owner });
  const revoked = await api('/api/invites/redeem', { method: 'POST', body: { token: revokedInvite.data.token } });
  assert.equal(revoked.response.status, 404, 'revoke된 invite 거부');

  const expiredInvite = await api(`/api/trips/${id}/invites`, { method: 'POST', token: owner, body: { role: 'viewer', singleUse: false, expiresInSeconds: 1 } });
  await new Promise(resolve => setTimeout(resolve, 1100));
  const expired = await api('/api/invites/redeem', { method: 'POST', body: { token: expiredInvite.data.token } });
  assert.equal(expired.response.status, 404, '만료된 invite 거부');

  const oversized = new FormData(); oversized.append('file', new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: 'application/pdf' }), 'large.pdf');
  assert.equal((await api('/api/analyze-document', { method: 'POST', body: oversized })).response.status, 413, 'AI 분석 8MB 초과 차단');
  const badMime = new FormData(); badMime.append('file', new Blob(['text'], { type: 'text/plain' }), 'bad.txt');
  assert.equal((await api('/api/analyze-document', { method: 'POST', body: badMime })).response.status, 415, '잘못된 MIME 차단');
  const badMagic = new FormData(); badMagic.append('file', new Blob(['not a pdf'], { type: 'application/pdf' }), 'fake.pdf');
  assert.equal((await api('/api/analyze-document', { method: 'POST', body: badMagic })).response.status, 415, 'magic number 불일치 차단');

  let limited;
  for (let i = 0; i < 31; i += 1) limited = await api('/api/trips', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.77' }, body: {} });
  assert.equal(limited.response.status, 429, 'rate limit 정상 동작');

  await api(`/api/trips/${id}`, { method: 'DELETE', token: owner });
  console.log('14 API integration checks passed');
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
  else server.kill('SIGTERM');
}
