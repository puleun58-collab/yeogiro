import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const syncUiSource = await readFile(new URL('../sync-ui.js', import.meta.url), 'utf8');

// terminology: 동선 -> 이동 (spec section 2)
assert.doesNotMatch(source, /동선/, '동선 용어를 이동으로 통일');

// role terminology already correct (spec section 2)
assert.match(source, /role==='owner'\?'소유자':role==='editor'\?'편집 가능':'보기 전용'/, '권한 명칭 통일 유지');

// destructive button styling stays on coral accent, never primary blue
assert.match(source, /\.danger-action,\.delete,\.document-action-stack \.delete,\.access-actions \.delete\{background:var\(--danger-soft\);color:var\(--accent-coral\)\}/, '삭제 버튼 색상을 danger 토큰으로 통일');

// date values rendered through the shared formatter, not raw ISO strings, in display text
// (native <input type="date"> value attributes correctly keep raw ISO — only checked here
// for time/strong/small display nodes, which must go through fmt()).
assert.doesNotMatch(source, /\$\{f\.departDate\}|\$\{f\.arriveDate\}/, '항공편 날짜에 원시 ISO 문자열 미노출');
assert.match(source, /<time>\$\{esc\(fmt\(l\.checkInDate\)\)\}/, '숙소 체크인 날짜가 표시 형식으로 변환됨');
assert.match(source, /<time>\$\{esc\(fmt\(l\.checkOutDate\)\)\}/, '숙소 체크아웃 날짜가 표시 형식으로 변환됨');
assert.doesNotMatch(source, /\$\{x\.spentAt\}/, '지출 날짜에 원시 ISO 문자열 미노출');

// sync status wording matches spec section 17 (no raw technical terms)
assert.match(syncUiSource, /'동기화됨'/, '동기화 상태 문구 유지');
assert.doesNotMatch(source, />pending<|>outbox<|>revision</, '기술 용어를 화면에 직접 노출하지 않음');

// datebar chip sizing narrows on small viewports so short trips (2-5 days) never clip
// the trailing day chip against the container's right edge (reported visual bug: left
// margin visibly larger than right margin on a 4-day trip at common phone widths).
assert.match(source, /@media\(max-width:479px\)\{\.datechip\{min-width:74px;padding:9px 6px\}\.datebar\{gap:7px\}\}/, '중간 폭 모바일에서 날짜 칩 너비 축소 유지');
assert.match(source, /@media\(max-width:340px\)\{\.datechip\{min-width:66px;padding:9px 4px\}\.datebar\{gap:6px\}\}/, '초소형 화면에서 날짜 칩 너비 추가 축소 유지');

// design tokens: radius scale is fully tokenized (spec sections 15-16)
const css = source.slice(source.indexOf('<style'), source.indexOf('</style>'));
assert.deepEqual([...css.matchAll(/border-radius:\d+px/g)].map(x => x[0]), [], 'radius 값을 토큰으로 통일 (원시 px 사용 금지)');
for (const token of ['--radius-chip', '--radius-control-sm', '--radius-control', '--radius-card', '--radius-pill', '--radius-sheet'])
  assert.match(css, new RegExp(`${token}:`), `${token} 토큰 정의`);

// typography scale: same-role headings share one token (spec section 5)
for (const token of ['--fs-page', '--fs-section', '--fs-item', '--fs-body', '--fs-label', '--fs-caption'])
  assert.match(css, new RegExp(`${token}:`), `${token} 토큰 정의`);
assert.match(css, /\.sheet h2\{[^}]*font-size:var\(--fs-page\)/, '시트 제목이 page 타이포 토큰 사용');
assert.match(css, /\.today-empty h2\{[^}]*font-size:var\(--fs-page\)/, '홈 카드 제목이 page 타이포 토큰 사용');
assert.match(css, /\.section-title\{[^}]*font-size:var\(--fs-section\)/, '섹션 제목이 section 타이포 토큰 사용');
assert.match(css, /\.expense-section-head h2\{[^}]*font-size:var\(--fs-section\)/, '경비 섹션 제목이 section 타이포 토큰 사용');
assert.match(css, /\.weather-strip h2\{[^}]*font-size:var\(--fs-section\)/, '날씨 섹션 제목이 section 타이포 토큰 사용');
assert.match(css, /\.item h3\{[^}]*font-size:var\(--fs-item\)/, '일정 카드 제목이 item 타이포 토큰 사용');
assert.match(css, /\.lodging-card h3\{[^}]*font-size:var\(--fs-item\)/, '숙소 카드 제목이 item 타이포 토큰 사용');
for (const [selector, size] of [['.sheet h2', '26px'], ['.today-head h2', '24px'], ['.section-title', '18px'], ['.item h3', '17px']])
  assert.doesNotMatch(css, new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{[^}]*font-size:${size}`), `${selector} 원시 글자 크기 제거`);

// status colors come from tokens, never ad-hoc hex (spec section 12)
for (const token of ['--warning', '--caution', '--success', '--danger-soft'])
  assert.match(css, new RegExp(`${token}:`), `${token} 상태 토큰 정의`);
for (const hex of ['#a23f2d', '#a33d29', '#c54e34', '#b33;', '#80601f', '#79a17d', '#527a56'])
  assert.ok(!css.includes(hex), `상태 색상 하드코딩 제거: ${hex}`);

// section spacing is one token (spec section 17)
assert.match(css, /--section-space:\d+px/, '섹션 간격 토큰 정의');
assert.match(css, /\.section\{margin-bottom:var\(--section-space\)\}/, '섹션 간격이 토큰을 사용');
assert.match(css, /\.trip-focus\{margin-bottom:var\(--section-space\)\}/, '홈 섹션 간격이 같은 토큰을 사용');

// status icon placement: copy -> status -> chevron, no left-side status icons (spec section 11)
const prepFn = source.match(/function preparationSheet\(\)[\s\S]*?\nfunction notificationPrefs/)?.[0] || '';
assert.match(prepFn, /checkRow=\(x,state\)=>`<button class="prep-check \$\{state\}"[\s\S]{0,220}?<span class="prep-check-copy">/, '자동 점검 행은 제목이 먼저 배치됨');
assert.match(prepFn, /state==='required'\?'<span class="prep-state" aria-hidden="true">!<\/span>':state==='complete'\?'<span class="prep-state" aria-hidden="true">✓<\/span>':''/, '상태 아이콘은 제목 오른쪽에서 required/complete만 표시');
assert.doesNotMatch(prepFn, /<span class="prep-state" aria-hidden="true">\$\{state/, '왼쪽 상태 아이콘 제거');
assert.doesNotMatch(prepFn, /선택 사항, /, '선택 사항 행에는 상태 라벨을 붙이지 않음');
assert.match(prepFn, /aria-label="\$\{esc\(x\.title\)\}\$\{state==='required'\?', 확인 필요':state==='complete'\?', 완료':''\}/, '상태를 스크린리더 라벨로도 제공');
assert.match(css, /\.prep-check\{display:grid;grid-template-columns:minmax\(0,1fr\) auto auto/, '자동 점검 행 그리드가 제목·상태·chevron 순서');
assert.match(css, /\.prep-disclosure\[open\]>summary>span\[aria-hidden\]\{transform:rotate\(90deg\)\}/, '펼침 상태에서 chevron 방향 전환');

// touch targets stay >=44px even after compaction (spec sections 9, 22)
assert.match(css, /\.prep-menu>summary\{display:grid;width:44px;height:44px/, '오버플로 메뉴 터치 영역 확보');
assert.match(css, /\.prep-disclosure>summary\{min-height:44px\}/, '접기 행 터치 영역 확보');
assert.match(css, /\.today-support>button,\.today-support>div\{min-height:56px/, '홈 요약 셀 터치 영역 확보');

// placeholders stay short labels, not sentences (spec section 35)
for (const placeholder of [...source.matchAll(/placeholder="([^"]+)"/g)].map(x => x[1]))
  assert.ok(placeholder.length <= 24, `placeholder는 짧은 라벨 유지: ${placeholder}`);

// zero-value rows never render (spec sections 20, 29)
assert.doesNotMatch(source, /예보 없음|연결 서류 없음|등록된 경비 없음|아직 등록된 여행 정보가 없습니다/, '0값 자리표시자 제거');

console.log('49 QA consistency checks passed');
