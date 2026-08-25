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
  shortDate(value) {
    return String(value);
  }
};
vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}\nthis.activityHelpers={primaryActivity,groupActivities,activityMarkup,activityListMarkup};`, context);

const { primaryActivity, groupActivities, activityMarkup, activityListMarkup } = context.activityHelpers;
const base = { display_name: '여행 관리자', details: { fields: [] } };
const activity = (overrides = {}) => ({
  ...base,
  action: 'updated',
  entity_type: 'item',
  entity_id: 'item-1',
  label: '바나힐',
  created_at: '2026-08-23T07:12:00.000Z',
  ...overrides
});

assert.equal(primaryActivity(activity()), true, '일정 수정은 기본 최근 변경에 표시');
assert.equal(primaryActivity(activity({ entity_type: 'file' })), false, '예약 서류 메타데이터 수정은 기타 기록으로 분류');
assert.equal(primaryActivity(activity({ entity_type: 'trip', details: { fields: ['heroFileId'] } })), false, '대표사진 내부 저장 변경은 기타 기록으로 분류');
assert.equal(primaryActivity(activity({ entity_type: 'file', action: 'deleted' })), true, '예약 서류 삭제는 기본 최근 변경에 표시');
assert.equal(primaryActivity(activity({ entity_type: 'member', action: 'updated' })), true, '공유 권한 변경 형식은 기본 최근 변경에 표시');
assert.equal(primaryActivity(activity({ entity_type: 'trip', details: { category: 'access', semanticAction: 'updated', fields: ['role'] } })), true, '기존 감사 스키마의 의미 분류를 공유 권한 변경으로 표시');

const near = activity({ entity_id: 'item-2', label: '골든브릿지', created_at: '2026-08-23T07:06:00.000Z' });
const far = activity({ entity_id: 'item-3', label: '호이안', created_at: '2026-08-23T06:50:00.000Z' });
const groups = groupActivities([activity(), near, far]);
assert.equal(groups.length, 2, '같은 사용자·종류·동작의 10분 이내 기록만 묶음');
assert.equal(groups[0].entries.length, 2, '가까운 반복 기록을 한 묶음으로 유지');
assert.match(activityMarkup(groups[0]), /일정 2건 수정/, '묶음 제목에 대상 건수를 표시');

const many = Array.from({ length: 22 }, (_, index) => ({ ...activity({ entity_id: `item-${index}`, created_at: `2026-08-23T${String(23 - Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '40' : '55'}:00.000Z` }), entries: [activity({ entity_id: `item-${index}` })] }));
assert.match(activityListMarkup(many), /이전 기록 2건 더 보기/, '기본 20개 이후 기록은 더보기로 제공');

console.log('10 activity history UI checks passed');
