import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const syncUiSource = await readFile(new URL('../sync-ui.js', import.meta.url), 'utf8');

// terminology: 동선 -> 이동 (spec section 2)
assert.doesNotMatch(source, /동선/, '동선 용어를 이동으로 통일');

// role terminology already correct (spec section 2)
assert.match(source, /role==='owner'\?'소유자':role==='editor'\?'편집 가능':'보기 전용'/, '권한 명칭 통일 유지');

// destructive buttons use coral, not primary blue (spec section 4)
assert.match(source, /\.danger-action,\.delete,\.document-action-stack \.delete,\.access-actions \.delete\{background:#fff0f1;color:var\(--accent-coral\)\}/, '삭제류 버튼이 primary blue가 아닌 경고색 유지');

// date formatting: lodging/flight/expense show formatted dates, not raw ISO strings (spec section 12)
assert.match(source, /<time class="flight-date">\$\{esc\(fmt\(f\.departDate\|\|t\.start\)\)\}<\/time>/, '항공편 카드 날짜를 포맷된 형태로 표시');
assert.match(source, /<time>\$\{esc\(fmt\(l\.checkInDate\)\)\} · \$\{esc\(l\.checkInTime\)\}<\/time>/, '숙소 체크인 날짜를 포맷된 형태로 표시');
assert.match(source, /<time>\$\{esc\(fmt\(l\.checkOutDate\)\)\} · \$\{esc\(l\.checkOutTime\)\}<\/time>/, '숙소 체크아웃 날짜를 포맷된 형태로 표시');
assert.match(source, /<small>\$\{esc\(fmt\(x\.spentAt\)\)\} · \$\{esc\(expenseMemberName/, '지출 목록 날짜를 포맷된 형태로 표시');

// sync status wording matches spec section 17 (no raw technical terms)
assert.match(syncUiSource, /'동기화됨'/, '동기화 상태 문구 유지');
assert.doesNotMatch(source, />pending<|>outbox<|>revision</, '기술 용어를 화면에 직접 노출하지 않음');

console.log('9 QA consistency checks passed');
