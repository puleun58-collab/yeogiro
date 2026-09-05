import { readFileSync, writeFileSync, rmSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FILES = ['index.html', 'sync.js', 'sync-ui.js', 'travel-logic.js', 'notification-logic.js', 'preparation-logic.js', 'trip-recap-logic.js', 'data-integrity.js', 'diagnostics.js', 'expense-logic.js', 'weather-logic.js', 'pwa-update.js', 'offline.html', 'manifest.webmanifest', 'sw.js'];
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
let commit = '';
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
const build = commit ? `v${version} · ${commit}` : `v${version}`;

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
for (const file of FILES) copyFileSync(file, `dist/${file}`);
mkdirSync('dist/assets', { recursive: true });
for (const dir of ['icons', 'fonts']) cpSync(`assets/${dir}`, `dist/assets/${dir}`, { recursive: true });

const html = readFileSync('dist/index.html', 'utf8');
if (!html.includes('__APP_BUILD__')) throw new Error('index.html에 __APP_BUILD__ 자리표시자가 없습니다.');
writeFileSync('dist/index.html', html.replaceAll('__APP_BUILD__', build));
console.log(`build ${build} · ${FILES.length} files + assets`);
