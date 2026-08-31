import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const renderer = source.match(/function preparationSheet\(\)[\s\S]*?\nfunction notificationPrefs/)?.[0] || '';

assert.match(renderer, /status==='required'/, '확인 필요 상태를 별도로 분류');
assert.match(renderer, /status==='optional'/, '선택 사항 상태를 별도로 분류');
assert.match(renderer, /출발 전 확인 · \$\{required\.length\}건/, '실제 확인 필요 항목만 집계');
assert.doesNotMatch(renderer, />확인<\/button>/, '반복 확인 버튼 제거');
assert.match(renderer, /data-prep-action=.*prep-chevron/, '행 전체 바로가기와 chevron 유지');
assert.match(renderer, /선택 사항 \$\{optional\.length\}건 보기/, '선택 사항 기본 접힘');
assert.match(renderer, /완료 \$\{done\.length\}건 보기/, '완료 항목 기본 접힘');
assert.match(renderer, /summary\.flights\?/, '0건 항공편 요약 숨김');
assert.match(renderer, /아직 등록된 여행 정보가 없습니다/, '빈 요약 상태 제공');
assert.match(renderer, /role="progressbar"/, '준비 진행률 접근성 제공');
assert.match(renderer, /prep-menu-actions/, '정렬과 삭제를 overflow 메뉴로 이동');
assert.match(renderer, /state==='required'\?'! 확인 필요'/, '경고 표시는 확인 필요 상태로 제한');
assert.match(renderer, /날씨 · 예보 준비 중/, '예보 전 날씨를 중립 요약으로 표시');
assert.match(renderer, /required/, '빈 준비물 입력은 required로 차단');
assert.match(source, /if\(!title\)return/, '공백 준비물 입력도 저장 전에 차단');
console.log('15 preparation UI checks passed');
