import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {}, YeogiroStore: { status: () => currentStatus } };
vm.runInNewContext(readFileSync('sync-ui.js', 'utf8'), context);
let sheet = '';
let currentStatus = { online: true, phase: 'idle', pending: 0, lastSync: '', conflict: null };
const ui = context.window.createYeogiroSyncUI({ openSheet: html => { sheet = html; } });
const element = { textContent: '', dataset: {}, title: '' };

ui.paint(currentStatus, element);
assert.equal(element.textContent, '동기화됨');
ui.paint({ ...currentStatus, phase: 'syncing' }, element);
assert.equal(element.textContent, '↻ 동기화 중');
ui.paint({ ...currentStatus, pending: 3 }, element);
assert.equal(element.textContent, '↑ 3건 대기');
ui.paint({ ...currentStatus, online: false, pending: 2 }, element);
assert.equal(element.textContent, '● 오프라인');
ui.paint({ ...currentStatus, conflict: {} }, element);
assert.equal(element.textContent, '⚠ 확인 필요');

currentStatus = { ...currentStatus, online: false, pending: 2 };
ui.details();
assert.match(sheet, /이 기기에 안전하게 저장/);
assert.match(sheet, /인터넷 연결 후 자동으로 동기화/);

ui.conflict({ local: { items: [{ id: 'a', name: '내 일정' }], flights: [], lodgings: [] }, remote: { items: [{ id: 'a', name: '서버 일정' }], flights: [], lodgings: [] } });
assert.match(sheet, /일정 1개/);
assert.match(sheet, /다른 기기 변경사항 반영/);
assert.match(sheet, /이 기기 변경사항으로 저장/);
console.log('8 sync UI checks passed');
