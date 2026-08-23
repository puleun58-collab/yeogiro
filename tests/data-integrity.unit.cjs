const assert = require('node:assert/strict');
const data = require('../data-integrity.js');

assert.equal(data.isValidDate('2026-02-29'), false);
assert.equal(data.isValidDate('2028-02-29'), true);
assert.equal(data.isValidTime('24:00'), false);
assert.equal(data.normalizeFlightNumber(' tw 125 '), 'TW125');
assert.deepEqual(data.flightNumberParts('VJ879/TW008'), ['VJ879', 'TW008']);
assert.deepEqual(data.flightEntitiesFromExtraction({ kind: 'flight', reservationNumber: 'ABC1', flights: [{ flightNumber: 'VJ879' }, { flightNumber: 'TW008' }] }).map(x => [x.flightNumber, x.reservationNumber]), [['VJ879', 'ABC1'], ['TW008', 'ABC1']]);
assert.equal(data.normalizeAirport('icn 공항'), 'ICN');
assert.ok(data.similarity('Grand Signature Hoi An', 'Grand Signature  Hoi-An') > .9);

const trip = {
  start: '2026-08-20', end: '2026-08-25',
  flights: [{ id: 'f1', flightNumber: 'TW125', departDate: '2026-08-22', from: 'ICN', to: 'DAD' }],
  lodgings: [{ id: 'l1', name: 'Grand Signature Hoi An', checkInDate: '2026-08-22', checkOutDate: '2026-08-24' }],
  items: [{ id: 'i1', day: '2026-08-23', time: '10:00', name: '바나힐 투어', place: '바나힐' }]
};
assert.equal(data.findCandidates(trip, 'flight', { flightNumber: 'tw 125', departDate: '2026-08-22', from: 'icn', to: 'dad' })[0].id, 'f1');
assert.equal(data.findCandidates(trip, 'lodging', { name: 'Grand Signature Hoi-An', checkInDate: '2026-08-22', checkOutDate: '2026-08-24' })[0].id, 'l1');
assert.equal(data.findCandidates(trip, 'reservation', { name: '바나힐투어', day: '2026-08-23', time: '10:00', place: '바나 힐' })[0].id, 'i1');
assert.deepEqual(data.validateEntity('flight', { departDate: '2026-08-22', arriveDate: '2026-08-21', depart: '23:30', arrive: '02:10', from: 'ICN', to: 'DAD' }, trip).errors, ['도착 날짜는 출발 날짜보다 빠를 수 없습니다.']);
assert.ok(data.validateEntity('flight', { flightNumber: 'VJ879TW008', departDate: '2026-08-22', arriveDate: '2026-08-23', depart: '07:00', arrive: '09:40', from: 'ICN', to: 'DAD' }, trip).errors.some(x => x.includes('여러 개')));
assert.ok(data.validateEntity('flight', { flightNumber: 'VJ879', departDate: '2026-08-08', arriveDate: '2026-08-12', depart: '07:00', arrive: '09:40', from: 'ICN', to: 'DAD' }, trip).warnings.some(x => x.includes('날짜')));
assert.ok(data.validateEntity('reservation', { name: '외부 일정', day: '2026-08-30', time: '10:00' }, trip).errors.some(x => x.includes('여행 기간 밖')));
assert.equal(data.diffFields({ time: '07:00' }, { time: '07:30' }, ['time']).length, 1);
assert.deepEqual(data.backupSummary({ trips: [{ items: [{ userDocs: [{ id: 'd1' }] }], flights: [{}], lodgings: [], files: [] }] }), { trips: 1, items: 1, flights: 1, lodgings: 0, documents: 1, files: 1 });
console.log('17 data integrity checks passed');
