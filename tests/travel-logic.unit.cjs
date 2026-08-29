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
assert.deepEqual(travel.terminalInfo('1'), { text: 'T1', label: '터미널 1' });
assert.deepEqual(travel.terminalInfo('Terminal 2'), { text: 'T2', label: '터미널 2' });
assert.deepEqual(travel.terminalInfo('제1터미널'), { text: 'T1', label: '터미널 1' });
assert.deepEqual(travel.terminalInfo('North'), { text: 'North', label: '터미널 North' });
assert.equal(travel.tripPhase({ start: '2026-08-22', end: '2026-08-24' }, '2026-08-21'), 'before');
assert.equal(travel.tripPhase({ start: '2026-08-22', end: '2026-08-24' }, '2026-08-23'), 'during');
assert.equal(travel.tripPhase({ start: '2026-08-22', end: '2026-08-24' }, '2026-08-25'), 'after');

const routeStops = [
  { id: 'hotel', type: 'lodging', lat: 16, lng: 108 },
  { id: 'market', type: 'item', lat: 16.02, lng: 108.02 },
  { id: 'beach', type: 'item', lat: 16.04, lng: 108.04 }
];
const routeLegs = [
  { durationMinutes: 20, distanceKm: 8 },
  { durationMinutes: 15, distanceKm: 5 }
];
assert.deepEqual(travel.routeSummary(routeStops, routeLegs), {
  places: 2,
  durationMinutes: 35,
  distanceKm: 13,
  complete: true
}, 'route totals count itinerary places but include lodging legs');
assert.equal(travel.routeSummary(routeStops, [routeLegs[0]]).durationMinutes, null, 'partial route data does not invent a total');

const inefficient = [
  { id: 'a', type: 'item', lat: 0, lng: 0 },
  { id: 'b', type: 'item', lat: 0, lng: 2 },
  { id: 'c', type: 'item', lat: 0, lng: 1 },
  { id: 'd', type: 'item', lat: 0, lng: 3 }
];
const suggestion = travel.routeSuggestion(inefficient);
assert.deepEqual(suggestion.order, ['a', 'c', 'b', 'd'], 'an adjacent swap can reduce obvious backtracking');
assert.ok(suggestion.savedKm > 100, 'suggestion reports real distance reduction');
assert.equal(travel.routeSuggestion([{ id: 'hotel', type: 'lodging', lat: 0, lng: -1 }, ...inefficient]).order[0], 'hotel', 'lodging remains a fixed route anchor while scoring');
assert.equal(travel.routeSuggestion(inefficient.map((item, index) => ({ ...item, fixed: index === 1 || index === 2 }))), null, 'fixed stops are protected from suggestions');
assert.equal(travel.routeSuggestion(inefficient.slice(0, 2)), null, 'two stops do not produce a reorder suggestion');

assert.equal(travel.routeWarning(
  { time: '10:00', endTime: '11:50' },
  { time: '12:00', move: '도보' },
  { durationMinutes: 25 }
).level, 'conflict', 'time conflicts outrank other route warnings');
assert.equal(travel.routeWarning(
  { time: '10:00', endTime: '10:30' },
  { time: '12:00', move: '도보' },
  { durationMinutes: null }
).level, 'route', 'unavailable routes are explicit');
assert.equal(travel.routeWarning(
  { time: '10:00', endTime: '10:30' },
  { time: '12:00', move: '도보' },
  { durationMinutes: 20 },
  { precipitationProbability: 80 }
).level, 'weather', 'rain advice follows time and route warnings');
assert.equal(travel.routeWarning(
  { time: '10:00' },
  { time: '12:00', move: '자동차' },
  { durationMinutes: 20 }
).level, 'reference', 'missing end time is a reference note rather than a strong warning');

console.log('35 travel logic checks passed');
