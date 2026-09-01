import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const renderer = source.match(/function renderTripFocus\(t,today,stateToday\)\{[\s\S]*?\nconst renderTripFocusBase/)?.[0] || '';
const before = renderer.match(/if\(phase==='before'\)\{[\s\S]*?(?=if\(phase==='after'\))/)?.[0] || '';
const after = renderer.match(/if\(phase==='after'\)\{[\s\S]*?(?=let current=)/)?.[0] || '';

assert.ok(renderer, '적응형 홈 렌더러 범위를 찾음');
assert.match(renderer, /if\(phase==='before'\)/, '여행 전 분기 제공');
assert.match(renderer, /if\(phase==='after'\)/, '여행 완료 분기 제공');
assert.match(renderer, /let current=stateToday\.current/, '여행 중 분기 제공');

assert.match(before, /여행 전 · D-\$\{daysLeft\}/, '여행 전 D-day eyebrow 표시');
assert.match(before, /<h2>여행 준비 \$\{stats\.progress\.done\} \/ \$\{stats\.progress\.total\} 완료<\/h2>/, '여행 전 카드 제목이 준비 진행률을 우선 표시');
assert.doesNotMatch(before, /<h2>\$\{esc\(t\.title\)\}<\/h2>/, '히어로가 이미 보여주는 여행 제목을 카드에서 중복하지 않음');
assert.match(before, /cities\.length>1\?`<p class="memo">\$\{esc\(homeCityLine\(t\)\)\}<\/p>`:''/, '도시가 여러 곳일 때만 도시 요약 표시');
assert.doesNotMatch(before, /fmt\(t\.start\)\} ~ \$\{fmt\(t\.end\)/, '히어로가 이미 보여주는 여행 기간을 카드에서 중복하지 않음');
assert.match(before, /\$\{stats\.progress\.done\} \/ \$\{stats\.progress\.total\} 완료/, '여행 준비 완료 수 표시');
assert.match(before, /role="progressbar"/, '여행 전 준비 진행률 접근성 제공');
assert.match(before, /출발 전 확인 \$\{stats\.required\.length\}건/, '필수 확인 항목 수 표시');
assert.match(before, /출발 전 확인 완료/, '필수 확인 항목이 없을 때 완료 상태 표시');
assert.match(before, /\(t\.flights\|\|\[\]\)\.length\?`항공편/, '항공편이 있을 때만 홈 사실에 포함');
assert.match(before, /\(t\.lodgings\|\|\[\]\)\.length\?`숙소/, '숙소가 있을 때만 홈 사실에 포함');
assert.match(before, /docs\?`예약서류/, '예약서류가 있을 때만 홈 사실에 포함');
assert.match(before, /\.filter\(Boolean\)/, '비어 있는 홈 사실을 제거');
assert.match(before, /facts\.length\?`<p class="memo home-facts">/, '홈 사실이 있을 때만 섹션 렌더링');
assert.match(before, /imminent&&first\?/, '출발 임박 시 첫 일정 표시');
assert.match(before, /imminent&&startFlight\?/, '출발 임박 시 첫날 항공편 표시');
assert.match(before, /imminent&&startLodging\?/, '출발 임박 시 첫날 숙소 표시');
assert.match(before, /stats\.weather\.available\?`<p class="memo home-weather">/, '첫날 예보가 있으면 날씨 표시');
assert.match(before, /날씨 · 아직 예보 기간 전/, '예보 기간 전 안내 표시');
assert.match(before, /<button class="save" data-preparation>여행 준비 계속하기<\/button>/, '여행 전 기본 CTA 제공');
assert.equal((before.match(/class="save"/g) || []).length, 1, '여행 전 기본 CTA를 하나만 강조');

assert.match(after, /여행 완료/, '완료 eyebrow 표시');
assert.match(after, /<h2>여행이 끝났습니다<\/h2>/, '완료 상태 메시지 표시');
assert.doesNotMatch(after, /\$\{esc\(fmt\(t\.start\)\)\} ~ \$\{esc\(fmt\(t\.end\)\)\}/, '히어로가 이미 보여주는 기간을 완료 카드에서 중복하지 않음');
assert.match(after, /\$\{nights\(t\)\}박 \$\{nights\(t\)\+1\}일/, '여행 기간과 숙박 일수 표시');
assert.match(after, /\(t\.items\|\|\[\]\)\.length\?`일정 \$\{\(t\.items\|\|\[\]\)\.length\}개`:''/, '일정이 있을 때만 완료 요약에 포함');
assert.match(after, /places\?`방문 장소 \$\{places\}곳`:''/, '방문 장소가 있을 때만 요약에 포함');
assert.match(after, /total\?`총 경비 \$\{money\(total\)\}`:''/, '경비가 있을 때만 요약에 포함');
assert.match(after, /\.filter\(Boolean\)\.join\(' · '\)/, '비어 있는 완료 요약을 제거');
assert.match(after, /recap\?`<p class="memo">\$\{esc\(recap\)\}<\/p>`:''/, '완료 사실이 있을 때만 요약 줄 렌더링');
assert.match(after, /settlement=tripSettlementStatus\(t\)/, '정산 상태 계산');
assert.match(after, /settlement\?`<p class="home-state/, '정산 상태가 있을 때만 상태 줄 표시');
assert.match(after, /정산 필요[\s\S]*정산 완료/, '필요와 완료 정산 상태 제공');
assert.match(after, /<button class="save" data-after-trip="schedule">여행 기록 보기<\/button>/, '여행 완료 기본 CTA 제공');
assert.match(after, /settlement==='unsettled'\?'<button data-after-trip="settlement">정산 보기<\/button>':''/, '미정산일 때만 정산 보기 제공');
assert.equal((after.match(/class="save"/g) || []).length, 1, '여행 완료 기본 CTA를 하나만 강조');

assert.match(renderer, /support=`<div class="today-support">/, '여행 중 지원 셀 영역 제공');
assert.match(renderer, /\$\{ctx\.weatherText\?`<button data-today-weather>/, '날씨 데이터가 있을 때만 오늘 날씨 셀 표시');
assert.match(renderer, /\$\{ctx\.docs\.length\?`<button data-doc-file=/, '예약 데이터가 있을 때만 오늘 예약 셀 표시');
assert.match(renderer, /\$\{ctx\.expenseSummary\.totalMinor\?`<button data-today-expense>/, '경비가 있을 때만 오늘 경비 셀 표시');
assert.match(renderer, /\$\{ctx\.move\?`<button data-today-route>/, '이동 데이터가 있을 때만 오늘 이동 요약 셀 표시');
assert.match(renderer, /\$\{ctx\.prepPending\?`<button data-preparation>/, '미완료 준비물이 있을 때만 준비물 셀 표시');
assert.match(source, /prepPending=homePrepStats\(t,\{withChecks:false,create:false\}\)\.pending/, '여행 중 홈 렌더가 체크리스트를 새로 만들지 않음');
assert.doesNotMatch(renderer, /예보 없음/, '오늘 날씨 빈 상태 placeholder 제거');
assert.doesNotMatch(renderer, /연결 서류 없음/, '오늘 예약 빈 상태 placeholder 제거');
assert.doesNotMatch(renderer, /등록된 경비 없음/, '오늘 경비 빈 상태 placeholder 제거');

assert.match(source, /hour<12\?'오전':'오후'/, '시각 helper가 오전과 오후를 구분');
assert.match(source, /\$\{hour%12\|\|12\}:\$\{parts\[2\]\}/, '시각 helper가 시를 0으로 채우지 않고 분을 유지');
assert.match(source, /function clockLabel\(value\)/, '오전 오후 시각 helper 제공');
assert.match(source, /function preferredTripId\(\)\{return YeogiroTravel\.preferredTripId/, '선호 여행 선택 wrapper 제공');
assert.match(source, /function homeCityLine\(t\)/, '홈 도시 요약 helper 제공');
assert.match(source, /function legKey\(a,b\)/, '이동 구간 key helper 제공');
assert.match(source, /function todayMoveSummary\(t,today\)/, '오늘 이동 요약 helper 제공');
assert.match(source, /function homePrepStats\(t,\{withChecks=true,create=true\}=\{\}\)/, '홈 준비 상태 helper 제공');

assert.match(source, /if\(!state\.activeId\|\|!state\.trips\.some\(t=>t\.id===state\.activeId\)\)state\.activeId=preferredTripId\(\)/, '초기 여행 선택 fallback에 선호 여행 적용');
assert.match(source, /state\.activeId=state\.trips\.some\(t=>t\.id===state\.activeId\)\?state\.activeId:preferredTripId\(\)/, '백업 여행 선택 fallback에 선호 여행 적용');
assert.match(source, /else state\.activeId=preferredTripId\(\)/, '여행 나가기 fallback에 선호 여행 적용');
assert.match(source, /state=x;state\.activeId=state\.trips\.some\(t=>t\.id===state\.activeId\)\?state\.activeId:preferredTripId\(\)/, '가져오기 fallback에 선호 여행 적용');
assert.match(source, /if\(!state\.trips\.some\(t=>t\.id===state\.activeId\)\)state\.activeId=preferredTripId\(\)/, '동기화 fallback에 선호 여행 적용');
const directFirstTripSelections = [...source.matchAll(/state\.activeId=state\.trips\[0\]\.id/g)];
assert.equal(directFirstTripSelections.length, 3, '첫 여행 직접 선택은 sample 재생성과 초기화 경로에만 유지');
assert.ok(directFirstTripSelections.every(match => source.slice(Math.max(0, match.index - 30), match.index).includes('state=sample()')), '첫 여행 직접 선택이 모두 sample 재생성 직후에만 실행');

console.log('65 adaptive home checks passed');
