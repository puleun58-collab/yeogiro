import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(readFileSync('pwa-update.js', 'utf8'), context);
const { updateState } = context.window.YeogiroPwa;

assert.equal(updateState({ pending: 0 }, true, true).ready, true, 'installed update is ready when data is saved');
assert.equal(updateState({ pending: 2 }, true, true).code, 'pending', 'queued changes block activation');
assert.match(updateState({ pending: 2 }, true, true).title, /2건/, 'pending count is explained');
assert.equal(updateState({ conflict: {} }, true, true).code, 'conflict', 'sync conflict blocks activation');
assert.equal(updateState({ pending: 0 }, false, true).code, 'latest', 'no waiting worker means current version is latest');
assert.equal(updateState({ pending: 0 }, false, false).code, 'offline', 'offline update checks retain current version');
assert.equal(updateState({ pending: 0 }, true, false).ready, true, 'fully installed waiting worker can activate offline');
assert.match(updateState({ pending: 0 }, true, true).detail, /원본은 그대로 유지/, 'ready state explains data preservation');

console.log('8 PWA update checks passed');
