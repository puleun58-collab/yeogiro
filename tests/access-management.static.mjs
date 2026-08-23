import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('index.html', 'utf8');

assert.equal((source.match(/function shareSettings/g) || []).length, 1, '공유 관리 화면 구현은 하나만 존재');
assert.equal((source.match(/function recoverSheet/g) || []).length, 1, '여행 복구 화면 구현은 하나만 존재');
assert.equal((source.match(/function recoveryResult/g) || []).length, 1, '복구 코드 결과 화면 구현은 하나만 존재');
assert.doesNotMatch(source, /shareSettings\s*=\s*async|recoverSheet\s*=|recoveryResult\s*=/, '함수 재할당 오버라이드 제거');
assert.doesNotMatch(source, /소유권 복구키|복구키 재발급|동행자|소유권 이전/, '이전 사용자 용어 제거');
assert.match(source, /id="deviceNameForm"[\s\S]*maxlength="40"/, '기기 이름 변경 폼과 길이 제한 제공');
assert.match(source, /days>=90\?'오래된 연결':!session\.current&&days>=30\?'30일 이상 사용하지 않음'/, '오래된 기기 안내 기준 제공');
assert.match(source, /management-primary-action[\s\S]*min-height:48px/, '관리 기본 버튼 규격 통일');

console.log('8 access management UI checks passed');
