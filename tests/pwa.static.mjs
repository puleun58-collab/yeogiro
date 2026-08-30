import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('sw.js', 'utf8');
assert.match(source, /url\.pathname\.startsWith\('\/api\/'\)\) return;/, 'API requests bypass Service Worker caches');
assert.match(source, /MAX_MAP_ENTRIES\s*=\s*160/, 'map tile cache has a fixed upper bound');
assert.match(source, /cache\.keys\(\)/, 'map cache is trimmed after writes');
assert.match(source, /yeogiro-app-v57/, 'app shell cache version was advanced');
assert.match(source, /'\/sync-ui\.js\?v=57'/, 'conflict UI uses a versioned app-shell URL');
assert.match(source, /'\/travel-logic\.js\?v=57'/, 'travel state logic remains available offline');
assert.match(source, /'\/data-integrity\.js\?v=57'/, 'data integrity checks remain available offline');
assert.match(source, /'\/expense-logic\.js\?v=57'/, 'expense calculations remain available offline');
assert.match(source, /'\/weather-logic\.js\?v=57'/, 'cached weather presentation logic remains available offline');
assert.match(source, /'\/pwa-update\.js\?v=57'/, 'update gating logic remains available offline');
assert.match(source, /appCode \? networkFirst\(request\) : cacheFirst\(request, APP_CACHE\)/, 'online app code bypasses stale cache entries');
assert.doesNotMatch(source.match(/self\.addEventListener\('install'[\s\S]*?\n\}\);/)?.[0] || '', /skipWaiting/, 'new worker waits for explicit user activation');
assert.match(source, /event\.data\?\.type === 'SKIP_WAITING'/, 'waiting worker accepts explicit activation message');
assert.doesNotMatch(source, /indexedDB|localStorage/, 'service worker updates never mutate user data stores');
console.log('14 PWA cache checks passed');
