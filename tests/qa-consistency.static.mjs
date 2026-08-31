import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const syncUiSource = await readFile(new URL('../sync-ui.js', import.meta.url), 'utf8');

// terminology: 동선 -> 이동 (spec section 2)
assert.doesNotMatch(source, /동선/, '동선 용어를 이동으로 통일');

// role terminology already correct (spec section 2)
assert.match(source, /role==='owner'\?'소유자':role==='editor'\?'편집 가능':'보기 전용'/, '권한 명칭 통일 유지');

// destructive button styling stays on coral accent, never primary blue
assert.match(source, /\.danger-action,\.delete,\.document-action-stack \.delete,\.access-actions \.delete\{background:#fff0f1;color:var\(--accent-coral\)\}/, '삭제 버튼 색상 유지');

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

console.log('11 QA consistency checks passed');
