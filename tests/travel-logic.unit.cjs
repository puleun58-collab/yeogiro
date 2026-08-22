const assert = require('node:assert/strict');
const travel = require('../travel-logic.js');

const items = [
  { id: 'a', time: '10:00', cat: '명소', name: '박물관' },
  { id: 'b', time: '12:00', cat: '식당', name: '점심' },
  { id: 'c', time: '18:00', cat: '기타', name: '야경' }
];

let state = travel.scheduleState(items, 11 * 60);
assert.equal(state.current.item.id, 'a', 'the next start can conservatively close the current item');
assert.equal(state.next.item.id, 'b', 'the next item is selected after now');
assert.equal(state.entries.filter(entry => entry.status === 'next').length, 1, 'only the immediate next item is emphasized');

state = travel.scheduleState(items, 15 * 60);
assert.equal(state.current, null, 'a long gap does not keep the previous item active');
assert.equal(state.next.item.id, 'c', 'the next item remains available during a long gap');

state = travel.scheduleState(items, 20 * 60);
assert.equal(state.ended, true, 'the day ends after the final estimated item window');

assert.equal(travel.moveProfile('택시').key, 'driving');
assert.equal(travel.moveProfile('자전거').googleMode, 'bicycling');
assert.equal(travel.moveProfile('버스').routable, false);
assert.equal(travel.moveProfile('항공').durationMinutes, undefined);
assert.match(travel.routeBase('walking'), /routed-foot$/);
assert.match(travel.routeBase('cycling'), /routed-bike$/);
assert.match(travel.routeBase('driving'), /routed-car$/);

const driving = travel.fallbackLeg({ lat: 37.5, lng: 127 }, { lat: 37.55, lng: 127.05, move: '택시' });
assert.ok(driving.distanceKm > 0 && driving.durationMinutes > 0, 'fallback legs expose distance and duration');

const comfortable = travel.assessGap(
  { time: '10:00', endTime: '10:30', cat: '기타' },
  { time: '12:00' },
  { durationMinutes: 30 }
);
assert.equal(comfortable.level, 'comfortable');
assert.equal(comfortable.departureMinutes, 690);

const prepared = travel.assessGap(
  { time: '10:00', endTime: '10:30', cat: '기타' },
  { time: '12:00', preparationMinutes: 15 },
  { durationMinutes: 30 }
);
assert.equal(prepared.departureMinutes, 675, 'preparation time advances the recommended departure');

const conflict = travel.assessGap(
  { time: '10:00', endTime: '11:50', cat: '기타' },
  { time: '12:00' },
  { durationMinutes: 25 }
);
assert.equal(conflict.level, 'conflict');

assert.equal(travel.flightDayDelta('2026-08-22', '2026-08-23'), 1);
assert.equal(travel.tripPhase({ start: '2026-08-22', end: '2026-08-24' }, '2026-08-21'), 'before');
assert.equal(travel.tripPhase({ start: '2026-08-22', end: '2026-08-24' }, '2026-08-23'), 'during');
assert.equal(travel.tripPhase({ start: '2026-08-22', end: '2026-08-24' }, '2026-08-25'), 'after');

console.log('20 travel logic checks passed');
