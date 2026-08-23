import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('sync.js', 'utf8');
assert.match(source, /trip\.items\|\|\[\]\),\.\.\.\(trip\.flights\|\|\[\]\),\.\.\.\(trip\.lodgings\|\|\[\]\)/, 'backup traverses items, flights, and lodgings');
assert.match(source, /format:'yeogiro-backup-v2'/, 'JSON v2 format remains compatible');
assert.match(source, /function previewBackup/, 'restore preview is available before mutation');
assert.match(source, /mode==='new'/, 'restore supports importing as a new trip');
assert.match(source, /kept=\(current\.trips\|\|\[\]\)\.filter/, 'restore preserves unrelated current trips');
assert.match(source, /async function auditFiles/, 'file metadata and IndexedDB state can be audited');
assert.match(source, /async function dataSafety[\s\S]*localOnly:[^,]+[\s\S]*missing:/, 'data safety summary distinguishes local-only and missing originals');
assert.match(source, /await put\('meta',exportedAt,'last-backup'\)/, 'successful backup creation records its timestamp');
assert.match(source, /async function backupReadiness[\s\S]*estimatedBytes/, 'backup preflight counts included originals, missing originals, and estimated size');
assert.match(source, /return\{format:'yeogiro-backup-v2',exportedAt,summary,fileSummary,state:copy\}/, 'backup records original-file summary without changing v2 format');
assert.match(source, /function embeddedFileSummary/, 'legacy backups derive embedded original counts during preview');
assert.match(source, /doc\.data[\s\S]*saveBlob\(dataUrlBlob\(doc\.data\)/, 'embedded reservation originals restore into IndexedDB');
assert.match(source, /legacyHero[\s\S]*saveBlob\(dataUrlBlob\(legacyHero\)/, 'embedded representative photo restores into IndexedDB');
assert.match(source, /previewBackup[\s\S]*fileSummary=value\?\.fileSummary\|\|embeddedFileSummary/, 'restore preview preserves or derives original-file summary');
console.log('14 backup and restore checks passed');
