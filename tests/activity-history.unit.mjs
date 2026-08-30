import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync('index.html', 'utf8');
const start = source.indexOf('const activityTypeName=');
const end = source.indexOf('async function collaborationSheet', start);
assert.ok(start >= 0 && end > start, '최근 변경 표시 도우미를 찾을 수 있음');

const context = {
  esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  },
  iso(date) {
    const value = new Date(date);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  },
  roleName(role) {
    return role === 'owner' ? '소유자' : role === 'editor' ? '편집 가능' : '보기 전용';
  },
  shortDate(value) {
    return String(value);
  }
};
vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}\nthis.activityHelpers={primaryActivity,groupActivities,activityMarkup,activityListMarkup,activityClock,activityDayLabel,activityValueText,activityFilterKey,activityLabelText};`, context);

const { primaryActivity, groupActivities, activityMarkup, activityListMarkup, activityClock, activityDayLabel, activityValueText, activityFilterKey, activityLabelText } = context.activityHelpers;
const today = new Date();
const at = (hours, minutes, dayOffset = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOffset, hours, minutes).toISOString();
const base = { display_name: '여행 관리자', details: { fields: [] } };
const activity = (overrides = {}) => ({
  ...base,
  action: 'updated',
  entity_type: 'item',
  entity_id: 'item-1',
  label: '바나힐',
  created_at: at(18, 5),
  ...overrides
});

assert.equal(primaryActivity(activity()), true, '일정 수정은 기본 최근 변경에 표시');
assert.equal(primaryActivity(activity({ entity_type: 'file' })), false, '예약 서류 메타데이터 수정은 기타 기록으로 분류');
assert.equal(primaryActivity(activity({ entity_type: 'trip', details: { fields: ['heroFileId'] } })), false, '대표사진 내부 저장 변경은 기타 기록으로 분류');
assert.equal(primaryActivity(activity({ entity_type: 'file', action: 'deleted' })), true, '예약 서류 삭제는 기본 최근 변경에 표시');
assert.equal(primaryActivity(activity({ entity_type: 'member', action: 'updated' })), true, '공유 권한 변경 형식은 기본 최근 변경에 표시');
assert.equal(primaryActivity(activity({ entity_type: 'trip', details: { category: 'access', semanticAction: 'updated', fields: ['role'] } })), true, '기존 감사 스키마의 의미 분류를 공유 권한 변경으로 표시');

assert.equal(activityClock(at(21, 19)), '오후 9:19', '12시간제에서 앞자리 0을 제거');
assert.equal(activityClock(at(8, 5)), '오전 8:05', '분은 두 자리로 유지');
assert.equal(activityDayLabel(at(9, 0)), '오늘', '오늘 기록은 오늘로 표시');
assert.equal(activityDayLabel(at(9, 0, 1)), '어제', '어제 기록은 어제로 표시');
assert.match(activityDayLabel(at(9, 0, 5)), /^\d{1,2}월 \d{1,2}일$/, '지난 기록은 월·일로 표시');
assert.equal(activityLabelText({ label: '2026-08-30 21:00 토함경주보문단지' }), '토함경주보문단지', '기존 기록의 ISO 날짜·시간 문자열 제거');
assert.equal(activityLabelText({ label: '' }), '이름을 확인할 수 없는 항목', '이름이 없는 기록도 깨지지 않음');
assert.equal(activityValueText('role', 'viewer'), '보기 전용', '권한 값을 사용자 용어로 표시');
assert.equal(activityValueText('time', '21:00'), '오후 9:00', '시간 값을 12시간제로 표시');
assert.equal(activityValueText('day', '2026-08-30'), '8월 30일', '날짜 값을 사용자 표기로 변환');
assert.equal(activityValueText('title', null), '없음', '값이 비어 있으면 없음으로 표시');
assert.equal(activityFilterKey(activity()), 'schedule', '일정 기록은 일정 필터로 분류');
assert.equal(activityFilterKey(activity({ entity_type: 'trip' })), 'trip', '여행 정보 기록은 여행 필터로 분류');
assert.equal(activityFilterKey(activity({ entity_type: 'member' })), 'share', '참여자 기록은 공유 필터로 분류');
assert.equal(activityFilterKey(activity({ action: 'restored' })), 'recovery', '복원 기록은 복구 필터로 분류');

const near = activity({ entity_id: 'item-2', label: '골든브릿지', created_at: at(18, 1) });
const far = activity({ entity_id: 'item-3', label: '호이안', created_at: at(17, 30) });
const groups = groupActivities([activity(), near, far]);
assert.equal(groups.length, 2, '같은 사용자·종류·동작의 10분 이내 기록만 묶음');
assert.equal(groups[0].entries.length, 2, '가까운 반복 기록을 한 묶음으로 유지');
assert.match(activityMarkup(groups[0]), /일정 2건 수정/, '묶음 제목에 대상 건수를 표시');
assert.match(activityMarkup(groups[0]), /동행자 · 오후 6:05/, '기록에서 권한명 대신 참여자 표현과 12시간제 시간 사용');
assert.doesNotMatch(activityMarkup(groups[0]), /여행 관리자/, '권한명은 기록 문구에 노출하지 않음');
assert.match(activityMarkup(groups[0]), /<span class="activity-chevron" aria-hidden="true">›<\/span><\/summary>/, 'chevron을 우측 마지막 요소로 배치');

const detailed = groupActivities([activity({ details: { fields: ['time'], values: { time: { before: '19:30', after: '20:00' } } } })]);
assert.match(activityMarkup(detailed[0]), /<b>시간<\/b><span>오후 7:30 → 오후 8:00<\/span>/, '변경 전과 변경 후 값을 함께 표시');
const legacy = groupActivities([activity({ details: { fields: ['name'] } })]);
assert.match(activityMarkup(legacy[0]), /<b>변경 항목<\/b><span>이름<\/span>/, '변경 전·후 값이 없는 기존 기록은 변경 항목만 표시');
assert.match(activityMarkup(groupActivities([activity({ action: 'created', details: { fields: [] } })])[0]), /class="activity-row plain"/, '상세가 없는 기록은 펼침 없이 표시');

const many = Array.from({ length: 34 }, (_, index) => activity({ entity_id: `item-${index}`, created_at: at(20, 0, index % 2) }));
const list = activityListMarkup(groupActivities(many).slice(0, 34), 30);
assert.match(list, /<div class="activity-day">오늘<\/div>/, '같은 날짜 기록을 날짜 제목 아래로 묶음');
assert.match(list, /<div class="activity-day">어제<\/div>/, '다른 날짜는 별도 그룹으로 표시');
assert.match(list, /data-activity-more>이전 기록 \d+건 더 보기/, '기본 노출 이후 기록은 더 보기로 제공');

console.log('40 activity history UI checks passed');
