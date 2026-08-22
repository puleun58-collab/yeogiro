import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('sw.js', 'utf8');
assert.match(source, /url\.pathname\.startsWith\('\/api\/'\)\) return;/, 'API requests bypass Service Worker caches');
assert.match(source, /MAX_MAP_ENTRIES\s*=\s*160/, 'map tile cache has a fixed upper bound');
assert.match(source, /cache\.keys\(\)/, 'map cache is trimmed after writes');
assert.match(source, /yeogiro-app-v17/, 'app shell cache version was advanced');
console.log('4 PWA cache checks passed');
