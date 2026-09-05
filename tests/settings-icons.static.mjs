import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const source = readFileSync('index.html', 'utf8');
const worker = readFileSync('sw.js', 'utf8');
let checks = 0;
const check = () => { checks += 1; };

const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const settingsFn = slice('function settings(){', 'function devicePrefKey(');
const helpFn = slice('function help(){', 'function smartImportSheet(');
assert.ok(settingsFn.length > 400 && helpFn.length > 400, '설정과 사용법 화면 구현을 찾음'); check();

// 설정 메뉴 항목별 전용 아이콘
const settingsMenu = [
  ['id="dataSafety"', 'data-storage', '데이터 보관 상태'],
  ['id="myShare"', 'profile', '내 정보'],
  ['id="tripShare"', 'sharing', '공유 및 권한'],
  ['id="collaborationLog"', 'history-recovery', '기록 및 복구'],
  ['id="notificationSettings"', 'notifications', '알림 설정'],
  ['id="preparation"', 'travel-prep', '여행 준비'],
  ['id="allIcs"', 'calendar', '전체 일정 캘린더'],
  ['id="exportJson"', 'json-export', 'JSON 내보내기'],
  ['id="importJson"', 'json-import', 'JSON 불러오기'],
  ['id="installFromSettings"', 'install', '홈 화면에 추가'],
  ['data-open="help"', 'guide', '여기로 사용법'],
  ['id="appDiagnostics"', 'diagnostics', '앱 상태 진단'],
  ['id="resetAll"', 'reset', '전체 초기화']
];
for (const [selector, icon, label] of settingsMenu) {
  assert.match(
    settingsFn,
    new RegExp(`${selector}><img class="settings-icon" src="/assets/icons/settings/${icon}\\.svg" alt="" width="28" height="28">${label}</button>`),
    `${label} 항목이 전용 아이콘을 사용`
  );
  check();
}

// 사용법 화면의 액션 항목만 같은 아이콘 세트를 사용
for (const [selector, icon, label] of [
  ['data-open="shareSettings"', 'sharing', '참여자 초대'],
  ['data-open="deviceLinkHelp"', 'device-link', '새 기기 연결 방법'],
  ['data-open="preparationHelp"', 'travel-prep', '준비 체크리스트']
]) {
  assert.match(
    helpFn,
    new RegExp(`${selector}><img class="settings-icon" src="/assets/icons/settings/${icon}\\.svg" alt="" width="28" height="28">${label}</button>`),
    `사용법 화면의 ${label} 항목이 같은 아이콘 세트를 사용`
  );
  check();
}

// 설명 카드에는 아이콘을 새로 붙이지 않음
assert.doesNotMatch(helpFn, /help-card"><img|help-card"><svg/, '설명 위주 안내 카드에는 아이콘을 추가하지 않음'); check();
assert.equal((helpFn.match(/settings-icon/g) || []).length, 3, '사용법 화면은 기존 액션 항목 3개만 아이콘을 가짐'); check();

// 이모지 제거
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
assert.doesNotMatch(settingsFn, emoji, '설정 메뉴에서 이모지 아이콘 제거'); check();
assert.doesNotMatch(helpFn, emoji, '사용법 화면에서 이모지 아이콘 제거'); check();

// 아이콘 박스 규격과 정렬
assert.match(source, /\.settings-group button\{display:flex;align-items:center;gap:11px;min-height:57px;margin-bottom:0;padding:13px 15px\}/, '메뉴 행 높이를 유지하며 아이콘과 텍스트를 수직 중앙 정렬'); check();
assert.match(source, /\.settings-icon\{display:block;flex:0 0 28px;width:28px;height:28px;object-fit:contain\}/, '모든 아이콘이 동일한 28px icon box 사용'); check();

// 자산은 프로젝트 내부에 개별 SVG로 보관
const assets = [...new Set([...settingsMenu.map(x => x[1]), 'device-link'])];
for (const name of assets) {
  const path = `assets/icons/settings/${name}.svg`;
  assert.ok(existsSync(path), `${name} 아이콘이 프로젝트 내부에 존재`); check();
  const svg = readFileSync(path, 'utf8');
  assert.match(svg, /viewBox="0 0 32 32"/, `${name} 아이콘이 동일한 optical grid 사용`); check();
  assert.match(svg, /stroke="#16202e" stroke-width="2\.4"/, `${name} 아이콘이 진한 차콜 stroke를 사용`); check();
  assert.doesNotMatch(svg, /linearGradient|radialGradient|filter=|<image/, `${name} 아이콘에 그라데이션·비트맵 없음`); check();
  assert.match(worker, new RegExp(`'/assets/icons/settings/${name}\\.svg'`), `${name} 아이콘이 오프라인 캐시에 포함`); check();
}
for (const name of assets.filter(x => x !== 'reset')) {
  assert.match(readFileSync(`assets/icons/settings/${name}.svg`, 'utf8'), /#1b64da/, `${name} 아이콘이 여기로 블루 포인트를 사용`);
  check();
}
assert.match(readFileSync('assets/icons/settings/reset.svg', 'utf8'), /#e2452f/, '전체 초기화만 danger 포인트 색을 사용'); check();

// 출발 전 확인 warning 배지는 메뉴 아이콘과 분리 유지
assert.match(source, /\.prep-state\.required,\.prep-check\.required \.prep-state\{background:var\(--prep-warning-badge\)/, '준비 경고 배지는 별도 amber 정책을 유지'); check();
assert.doesNotMatch(source, /prep-state[^{]*\{[^}]*settings-icon/, '경고 배지에 메뉴 아이콘 스타일을 적용하지 않음'); check();

console.log(`${checks} settings icon checks passed`);
