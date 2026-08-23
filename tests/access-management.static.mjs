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
assert.match(source, /function myShareSettings/, '내 공유 정보 화면 제공');
assert.match(source, /id="displayNameForm"[\s\S]*maxlength="40"/, '표시명 변경 폼 제공');
assert.match(source, /function deviceLinkSheet[\s\S]*새 기기 연결 코드/, '공유 구성원 새 기기 연결 화면 제공');
assert.match(source, /function askConfirm/, '관리 작업은 앱 내부 확인 화면 사용');
assert.doesNotMatch(source, /dataset\.transferOwner\)\{if\(!confirm|dataset\.revokeMember\)\{if\(!confirm|dataset\.revokeSession\)\{[^}]*confirm/, '공유·기기 위험 작업에서 브라우저 확인창 제거');
assert.match(source, /id="collaborationLog"[^>]*>🕘 변경 내역 및 휴지통/, '설정에서 변경 내역과 휴지통 접근');
assert.match(source, /function collaborationSheet/, '변경 내역과 휴지통 모바일 관리 화면 제공');
assert.match(source, /data-restore-trash/, '삭제 항목 복원 동작 제공');
assert.match(source, /class="import-result-title"/, '분석 결과 제목에 전용 간격 클래스 적용');
assert.match(source, /\.import-result>\.review-callout\{margin:0 0 16px\}/, '저장 전 확인과 첫 입력 필드 사이 간격 제공');

console.log('18 access management UI checks passed');
