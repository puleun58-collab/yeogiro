import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const renderer = source.match(/function tripForm\(t\)[\s\S]*?\nfunction tripsSheet/)?.[0] || '';
const submitHandler = source.match(/addEventListener\('submit',async e=>\{[\s\S]*?토스트\)|addEventListener\('submit',async e=>\{[\s\S]*?render\(\);toast\('여행을 저장했습니다\.'\)\}\);/)?.[0]
  || source.match(/addEventListener\('submit',async e=>\{[\s\S]*?toast\('여행을 저장했습니다\.'\)\}\);/)?.[0] || '';

assert.match(renderer, /name="title"/, '제목 입력 필드 유지');
assert.match(renderer, /name="start"/, '시작일 입력 필드 유지');
assert.match(renderer, /name="end"/, '종료일 입력 필드 유지');
assert.match(renderer, /class="city-chips"/, '방문 도시를 칩 형태로 표시');
assert.doesNotMatch(renderer, /도시 \(쉼표 구분\)/, '쉼표 구분 도시 입력 문구 제거');
assert.match(renderer, /n\?'':`<div class="field"><label>부제<\/label>/, '새 여행 생성 시 부제 입력 숨김');
assert.match(renderer, /placeholder="예: 다낭 여행"/, '제목 예시 placeholder 제공');
assert.match(renderer, /maxlength="60"/, '여행 제목 길이 제한');
assert.match(source, /function bindTripCityControls\(\)/, '도시 추가 컨트롤 바인딩 함수 존재');
assert.match(source, /function cityChipsMarkup\(\)/, '도시 칩 렌더 함수 존재');
assert.match(source, /formCities\.push\(value\)/, '도시를 하나씩 배열에 추가');
assert.match(source, /formCities\.splice\(Number\(b\.dataset\.cityRemove\),1\)/, '개별 도시 칩 삭제 지원');
assert.match(source, /data-city-remove/, '도시 칩 삭제 버튼 존재');

assert.match(submitHandler, /if\(!title\)\{toast\('여행 제목을 입력해 주세요\.'\);return\}/, '빈 제목은 친절한 안내로 저장 차단');
assert.match(submitHandler, /toast\('여행 날짜를 확인해 주세요\.'\)/, '잘못된 날짜는 친절한 안내로 저장 차단');
assert.match(submitHandler, /cities:fd\.getAll\('cities'\)\.map\(x=>String\(x\)\.trim\(\)\)\.filter\(Boolean\)/, '도시 칩 순서대로 배열 저장');
assert.match(submitHandler, /note:String\(fd\.get\('note'\)\|\|''\)\.trim\(\)/, '기존 부제 데이터는 편집 화면에서 계속 저장');

console.log('17 trip form UI checks passed');
