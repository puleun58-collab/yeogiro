import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const port = 9700 + (process.pid % 200);
const base = `http://127.0.0.1:${port}`;
const persist = path.join(os.tmpdir(), `yeogiro-login-entry-${process.pid}-${Date.now()}`);
const quote = value => /[\s"]/u.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
const commandLine = args => ['npx', 'wrangler', ...args].map(quote).join(' ');
const wrangler = args => {
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', commandLine(args)], { encoding: 'utf8' })
    : spawnSync('npx', ['wrangler', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'wrangler command failed');
};
async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { const response = await fetch(base); if (response.status < 500) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('login entry E2E local Worker did not start');
}
async function waitForEntry(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('#loginGate').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.body.classList.contains('auth-entry-open'));
}
function watchErrors(page, errors) {
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/u.test(message.text())) errors.push(`console: ${message.text()}`);
  });
}

const build = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { encoding: 'utf8' })
  : spawnSync('npm', ['run', 'build'], { encoding: 'utf8' });
if (build.status !== 0) throw new Error(build.stderr || build.stdout || 'login entry E2E build failed');
wrangler(['d1', 'migrations', 'apply', 'yeogiro-db', '--local', '--persist-to', persist]);
const server = spawn(process.execPath, [path.resolve('node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--port', String(port), '--persist-to', persist], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk; });
server.stderr.on('data', chunk => { serverLog += chunk; });
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const errors = [];

  for (const width of [320, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 760 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    watchErrors(page, errors);
    await waitForEntry(page);
    assert.equal(await page.locator('#loginGate h1').textContent(), '여기로', `${width}px 전용 로그인 제목`);
    assert.equal(await page.getByRole('button', { name: 'Google로 계속하기' }).count(), 1, `${width}px Google 버튼 접근성 이름`);
    assert.equal(await page.getByRole('button', { name: '로그인 없이 시작' }).count(), 1, `${width}px 로컬 시작 선택지`);
    const buttonBox = await page.getByRole('button', { name: 'Google로 계속하기' }).boundingBox();
    const logoBox = await page.locator('#loginGate .google-login-logo').boundingBox();
    assert.ok(buttonBox && buttonBox.height >= 44, `${width}px Google 버튼 최소 터치 영역`);
    assert.ok(logoBox && logoBox.width >= 20 && logoBox.width <= 22 && logoBox.height >= 20 && logoBox.height <= 22, `${width}px Google 로고 크기`);
    assert.equal(await page.locator('#loginGate .google-login-logo').getAttribute('src'), '/assets/icons/auth/google-g.png', `${width}px 로컬 Google 공식 자산`);
    assert.ok(await page.locator('#loginGate .google-login-logo').evaluate(image => image.complete && image.naturalWidth > 0), `${width}px Google 로고 로드`);
    assert.equal(await page.locator('#loginGate a[href="/privacy"]').count(), 1, `${width}px 개인정보 처리방침 링크`);
    assert.equal(await page.locator('#loginGate a[href="/terms"]').count(), 1, `${width}px 이용약관 링크`);
    assert.equal(await page.locator('.appbar').isVisible(), false, `${width}px 로그인 전 앱 화면 미노출`);
    await context.close();
  }

  const guestContext = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
  const guestPage = await guestContext.newPage();
  watchErrors(guestPage, errors);
  await waitForEntry(guestPage);
  await guestPage.getByRole('button', { name: '로그인 없이 시작' }).click();
  await guestPage.waitForFunction(() => !document.body.classList.contains('auth-entry-open'));
  assert.equal(await guestPage.evaluate(() => localStorage.getItem('yeogiro-login-entry-dismissed')), '1', '로그인 없이 시작 선택 저장');
  assert.equal(await guestPage.locator('.appbar').isVisible(), true, '로그인 없이 기존 앱 진입');
  await guestPage.reload({ waitUntil: 'domcontentloaded' });
  await guestPage.waitForFunction(() => !document.body.classList.contains('auth-pending'));
  assert.equal(await guestPage.locator('#loginGate').isVisible(), false, '로컬 시작 뒤 재방문 로그인 화면 미표시');
  await guestContext.close();

  const offlineContext = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
  const offlinePage = await offlineContext.newPage();
  watchErrors(offlinePage, errors);
  await waitForEntry(offlinePage);
  await offlinePage.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }));
  await offlinePage.getByRole('button', { name: 'Google로 계속하기' }).click();
  assert.equal(await offlinePage.locator('#loginEntryError').textContent(), '인터넷에 연결한 후 로그인해 주세요.', '오프라인 Google 로그인 안내');
  await offlinePage.getByRole('button', { name: '로그인 없이 시작' }).click();
  assert.equal(await offlinePage.locator('.appbar').isVisible(), true, '오프라인에서도 로컬 앱 진입');
  await offlineContext.close();

  const oauthContext = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
  const oauthPage = await oauthContext.newPage();
  watchErrors(oauthPage, errors);
  let startUrl = '';
  await oauthPage.route('**/api/auth/config', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ googleEnabled: true, policyVersion: '1.1' }) }));
  await oauthPage.route('**/api/auth/google/start**', route => {
    startUrl = route.request().url();
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>OAuth handoff</title>' });
  });
  await waitForEntry(oauthPage);
  await oauthPage.getByRole('button', { name: 'Google로 계속하기' }).click();
  await oauthPage.waitForURL('**/api/auth/google/start**');
  const oauthStart = new URL(startUrl);
  assert.equal(oauthStart.searchParams.get('policy'), '1.1', '기존 OAuth 시작 함수와 정책 버전 재사용');
  assert.equal(oauthStart.searchParams.get('return_to'), '/', '기존 OAuth 복귀 경로 유지');
  await oauthPage.unroute('**/api/auth/google/start**');
  await oauthPage.goto(`${base}/?auth=failed`, { waitUntil: 'domcontentloaded' });
  await oauthPage.locator('#loginGate').waitFor({ state: 'visible' });
  assert.match(await oauthPage.locator('#loginEntryError').textContent(), /완료하지 못했습니다/, 'Google 취소·실패 뒤 재시도 안내');
  await oauthContext.close();

  const accountContext = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
  const accountPage = await accountContext.newPage();
  watchErrors(accountPage, errors);
  await accountPage.route('**/api/auth/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, account: { id: 'acct_test', displayName: '계정 사용자', email: 'account@example.test', avatarUrl: '', provider: 'google' }, session: { id: 'auth_session', deviceId: 'device_test' }, policies: { termsVersion: '1.1', privacyVersion: '1.1' } }) }));
  await accountPage.route('**/api/auth/trips', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips: [] }) }));
  await accountPage.goto(`${base}/?auth=success`, { waitUntil: 'domcontentloaded' });
  await accountPage.waitForFunction(() => !document.body.classList.contains('auth-pending'));
  assert.equal(await accountPage.locator('#loginGate').isVisible(), false, '유효한 계정 세션은 로그인 화면 미표시');
  assert.equal(await accountPage.locator('.appbar').isVisible(), true, '로그인 완료 뒤 기존 앱 진입');
  assert.equal(await accountPage.evaluate(() => localStorage.getItem('yeogiro-login-entry-dismissed')), '1', '로그인 성공 뒤 오프라인 재진입 상태 저장');
  await accountContext.close();

  assert.deepEqual(errors, [], '로그인 진입 시나리오에 브라우저 오류 없음');
  console.log('login entry E2E: all assertions passed');
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  if (browser) await browser.close();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
  else server.kill('SIGTERM');
}
