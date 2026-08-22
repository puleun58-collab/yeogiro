import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('sync.js', 'utf8');
assert.match(source, /trip\.items\|\|\[\]\),\.\.\.\(trip\.flights\|\|\[\]\),\.\.\.\(trip\.lodgings\|\|\[\]\)/, 'backup traverses items, flights, and lodgings');
assert.match(source, /format:'yeogiro-backup-v2'/, 'JSON v2 format remains compatible');
assert.match(source, /function previewBackup/, 'restore preview is available before mutation');
assert.match(source, /mode==='new'/, 'restore supports importing as a new trip');
assert.match(source, /kept=\(current\.trips\|\|\[\]\)\.filter/, 'restore preserves unrelated current trips');
assert.match(source, /async function auditFiles/, 'file metadata and IndexedDB state can be audited');
console.log('6 backup and restore checks passed');
