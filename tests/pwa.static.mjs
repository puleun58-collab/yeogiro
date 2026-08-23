import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('sw.js', 'utf8');
assert.match(source, /url\.pathname\.startsWith\('\/api\/'\)\) return;/, 'API requests bypass Service Worker caches');
assert.match(source, /MAX_MAP_ENTRIES\s*=\s*160/, 'map tile cache has a fixed upper bound');
assert.match(source, /cache\.keys\(\)/, 'map cache is trimmed after writes');
assert.match(source, /yeogiro-app-v34/, 'app shell cache version was advanced');
assert.match(source, /'\/sync-ui\.js\?v=34'/, 'conflict UI uses a versioned app-shell URL');
assert.match(source, /'\/travel-logic\.js\?v=34'/, 'travel state logic remains available offline');
assert.match(source, /'\/data-integrity\.js\?v=34'/, 'data integrity checks remain available offline');
assert.match(source, /appCode \? networkFirst\(request\) : cacheFirst\(request, APP_CACHE\)/, 'online app code bypasses stale cache entries');
console.log('8 PWA cache checks passed');
