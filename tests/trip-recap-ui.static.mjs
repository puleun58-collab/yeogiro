import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');

// script registration
assert.match(source, /trip-recap-logic\.js\?v=80/, 'trip recap logic script registered with current version');

// completion card wiring (previously a dead button)
assert.match(source, /b\.dataset\.afterTrip==='schedule'\)tripRecapSheet\(trip\(\)\)/, '여행 완료 카드의 기록 보기 버튼이 recap 시트에 연결됨');
assert.match(source, /b\.dataset\.afterTrip==='docs'\)documentCabinet\(\)/, '여행 완료 카드의 예약 서류 버튼이 서류함에 연결됨');
assert.equal((source.match(/closest\('\[data-after-trip\]'\)/g) || []).length, 1, '여행 완료 CTA를 처리하는 리스너는 하나만 존재');
assert.doesNotMatch(source, /dataset\.afterTrip==='backup'/, '사용하지 않는 여행 완료 backup 분기 제거');
assert.doesNotMatch(source, /dataset\.afterTrip\)\{e\.preventDefault\(\);e\.stopImmediatePropagation\(\);if\(b\.dataset\.afterTrip==='docs'\)/, '경로·서류 리스너가 여행 기록 CTA를 가로채지 않음');
assert.match(source, /class="card today-empty home-card"><small class="today-eyebrow">여행 완료<\/small>.*data-after-trip="schedule">여행 기록 보기/, '여행 종료 후 홈이 진행형 요소 대신 완료 화면으로 전환됨');
assert.doesNotMatch(source, /class="card trip-complete"/, '완료 카드가 공통 홈 카드 스타일을 사용');

// recap sheet composition and ordering
const recapFn = source.match(/function tripRecapSheet\(t=trip\(\)\)[\s\S]*?\nfunction similarTripSheet/)?.[0] || '';
assert.match(recapFn, /recap-period/, '기간 표시 유지');
assert.match(recapFn, /coreMetrics/, '핵심 요약 계산');
assert.match(recapFn, /summary\.totalMinor\?`총 경비/, '0값 항목은 핵심 요약에서 숨김');
assert.match(recapFn, /settlementSection/, '정산 상태 섹션 존재');
assert.match(recapFn, /날짜별 일정/, '날짜별 일정 섹션 존재');
assert.match(recapFn, /YeogiroRecap\.visitedPlaces/, '방문 장소 집계에 recap 로직 재사용');
assert.match(recapFn, /YeogiroRecap\.dayGroups/, '날짜별 일정에 recap 로직 재사용');
assert.match(recapFn, /YeogiroRecap\.distanceSummary/, '이동거리 요약에 recap 로직 재사용');
assert.match(recapFn, /기록된 이동거리 약/, '이동거리를 단정적이지 않게 표기');
assert.match(recapFn, /YeogiroRecap\.flightsSummary/, '항공편 요약에 recap 로직 재사용');
assert.match(recapFn, /YeogiroRecap\.lodgingsSummary/, '숙소 요약에 recap 로직 재사용');
assert.doesNotMatch(recapFn, /reservationNumber/, '예약번호 등 민감정보를 기록 화면에 직접 노출하지 않음');
assert.match(recapFn, /canEdit\?`<button class="addline" data-recap-action="similar">비슷한 여행 만들기/, 'viewer에게는 비슷한 여행 만들기 숨김');

// trip list grouping
const listFn = source.match(/function tripListBody\(query=''\)[\s\S]*?\n\}/)?.[0] || '';
assert.match(listFn, /YeogiroRecap\.groupTrips/, '여행 목록이 recap 그룹핑 로직을 재사용');
assert.match(listFn, /여행 중/, '여행 중 그룹 표시');
assert.match(listFn, /다가오는 여행/, '예정 그룹 표시');
assert.match(listFn, /지난 여행/, '지난 여행 그룹 표시');
assert.match(source, /tripListFilter/, '여행이 많을 때 빠른 검색 입력 제공');
assert.match(source, /triprow-status/, '미정산 지난 여행에 상태 배지 제공');

// similar trip duplication excludes sensitive/derived data
const similarFn = source.match(/function similarTripSheet\(source\)[\s\S]*?\n\}/)?.[0] || '';
assert.match(similarFn, /includeItinerary/, '일정 템플릿 포함 여부 선택 가능');
assert.match(similarFn, /includeChecklist/, '체크리스트 포함 여부 선택 가능');
assert.match(similarFn, /예약번호, 항공편, 숙소, 예약서류, 경비는 복사하지 않습니다/, '민감정보 미복제 안내');
assert.match(source, /YeogiroRecap\.duplicateTrip\(\{source,newId:uid\(\),newTitle:title,newStart:start,newEnd:end/, '복제 제출 시 recap 로직으로 새 여행 생성');

console.log('26 trip recap UI checks passed');
