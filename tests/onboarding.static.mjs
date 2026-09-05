import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');

// blank-trip detection and onboarding state (spec: first-run onboarding, existing-user protection)
assert.match(source, /function isBlankTrip\(t\)\{return t\.title==='새 여행'/, 'isBlankTrip 함수 존재');
assert.match(source, /function shouldShowOnboarding\(\)\{try\{if\(localStorage\.getItem\('yeogiro-onboarding-seen'\)\)return false/, '온보딩 표시 조건이 로컬 저장 플래그를 확인함');
assert.match(source, /function markOnboardingSeen\(\)\{try\{localStorage\.setItem\('yeogiro-onboarding-seen','1'\)/, '온보딩 완료 플래그 저장 함수 존재');
assert.match(source, /if\(!\(state\.trips\.length===1&&isBlankTrip\(state\.trips\[0\]\)\)\)markOnboardingSeen\(\);/, '기존 사용자는 부트스트랩 시점에 온보딩 플래그가 즉시 설정됨 (재노출 방지)');

// onboarding steps: exactly 3, matching the spec copy
assert.match(source, /const ONBOARDING_STEPS=\[\{title:'여행을 한곳에서 관리하세요'/, '온보딩 1단계 문구 존재');
assert.match(source, /title:'동행자와 함께 사용할 수 있어요'/, '온보딩 2단계 문구 존재');
assert.match(source, /title:'여행 전부터 여행 후까지'/, '온보딩 3단계 문구 존재');
{
  const stepsMatch = source.match(/const ONBOARDING_STEPS=(\[[\s\S]*?\]);/);
  assert.ok(stepsMatch, 'ONBOARDING_STEPS 배열 파싱 가능');
  const stepCount = (stepsMatch[1].match(/\{title:/g) || []).length;
  assert.equal(stepCount, 3, '온보딩은 정확히 3단계');
}

// onboarding sheet: skip always available, dots for progress, prev/next navigation
assert.match(source, /data-onboarding-skip>건너뛰기/, '1단계에 건너뛰기 버튼 노출');
assert.match(source, /data-onboarding-prev>이전/, '2단계 이후 이전 버튼 제공');
assert.match(source, /\$\{last\?'시작하기':'다음'\}/, '마지막 단계에서 시작하기 버튼으로 전환');
assert.match(source, /class="onboarding-dots"/, '진행 상태 점 표시 존재');

// zero-trip welcome screen: single primary CTA + secondary join action, hides complex dashboard
assert.match(source, /data-welcome-action="create">여행 만들기/, '첫 화면 기본 CTA는 여행 만들기');
assert.match(source, /data-welcome-action="join">여행 참여하기/, '보조 CTA로 여행 참여하기 제공');
assert.match(source, /\$\('#schedulePage'\)\.classList\.add\('onboarding-empty'\)/, '빈 여행 상태에서 복잡한 대시보드 숨김 클래스 적용');
assert.match(source, /\.onboarding-empty \.import-section,\.onboarding-empty \.schedule-grid\{display:none\}/, '빈 여행 상태 CSS로 가져오기/이동 섹션 숨김');
assert.match(source, /function joinTripSheet\(\)\{openSheet\(`<h2>여행 참여하기<\/h2>/, '여행 참여하기 초대 링크 입력 시트 존재');

// unified empty schedule CTA replaces noisy per-day empty cards when the trip has zero items
assert.match(source, /class="card today-empty schedule-empty"><h2>아직 일정이 없습니다<\/h2><p class="memo">여행에서 가고 싶은 장소나 계획을 추가해 보세요\.<\/p>/, '빈 일정 상태에 단일 안내 카드와 CTA 제공');
assert.match(source, /data-before-trip="add">첫 일정 추가/, '빈 일정 상태 CTA 문구는 첫 일정 추가');
assert.match(source, /'<div class="expense-empty">아직 기록된 지출이 없습니다\.<\/div>'/, '경비 빈 상태 문구가 스펙과 일치 (단일 CTA는 헤더의 지출 추가 버튼)');

assert.match(source, /toast\(!firstTrip\?'여행을 저장했습니다\.':t\.cities\.length\?'여행을 만들었습니다\. 첫 일정을 추가해 보세요\.':'여행을 만들었습니다\. 방문 도시를 먼저 추가해 주세요\.'\)/, '여행 생성 직후 다음 행동 안내 토스트 (신규 및 재사용된 빈 여행 모두 포함)');

// 온보딩은 첫 방문에서만 제공하며 사용법 화면에서 다시 여는 진입점은 두지 않는다.
assert.doesNotMatch(source, /data-open="onboarding"/, '사용법 화면에 소개 화면 다시 보기 진입점이 없음');
assert.doesNotMatch(source, /처음부터 사용법 보기|소개 화면 다시 보기/, '설정과 사용법 화면 모두 온보딩 재생 항목을 노출하지 않음');
assert.doesNotMatch(source, /onboarding:\(\)=>onboardingSheet\(0\)/, '일반 data-open 디스패처에서 온보딩 재생 경로를 제거함');

// usage guide restructured by trip-flow stage, not a flat feature list
for (const heading of ['여행 시작하기', '함께 사용하기', '여행 준비하기', '여행 중 사용하기', '여행이 끝난 뒤']) {
  assert.ok(source.includes(heading), `사용법 화면에 "${heading}" 단계 섹션 존재`);
}
assert.match(source, /data-open="deviceLinkHelp">🔗 새 기기 연결 방법/, '사용법에서 새 기기 연결 도움말로 바로 연결됨');

// device link explanation clarifies it is not a new-participant invite
assert.match(source, /새 참여자를 초대하는 기능이 아니라, 같은 사용자가 다른 기기에서 이 여행에 연결하는 기능입니다\./g, '새 기기 연결 설명 문구 존재');

// simplified first share experience: invite-first when there are no other members yet
assert.match(source, /if\(x\.members\.length<=1&&!activeInvites\.length\)\{openSheet\(canManage\?`<h2>공유 및 권한<\/h2><div class="form"><div class="help-card"><b>함께 여행할 사람을 초대해 보세요/, '공유 화면 첫 경험이 초대 중심으로 단순화됨');

// AI import already discloses that results are not auto-saved (verified, not modified)
assert.match(source, /자동 추출값은 바로 저장되지 않습니다\. 기존 데이터와 비교한 뒤 적용할 내용을 확인하세요\./, 'AI 문서 입력 시 자동 저장 오해 방지 문구 유지');

console.log('22 onboarding and guided-discovery checks passed');
