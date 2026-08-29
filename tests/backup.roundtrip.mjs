import assert from 'node:assert/strict';

const stores = new Map();
const definitions = new Map();
const request = work => {
  const value = {};
  setTimeout(() => {
    try { value.result = work(); value.onsuccess?.(); }
    catch (error) { value.error = error; value.onerror?.(); }
  });
  return value;
};
const objectStore = name => ({
  get: key => request(() => stores.get(name)?.get(key)),
  getAll: () => request(() => [...(stores.get(name)?.values() || [])]),
  put: (value, explicitKey) => request(() => {
    const keyPath = definitions.get(name)?.keyPath;
    const key = explicitKey ?? (keyPath ? value[keyPath] : undefined);
    if (key === undefined) throw new Error(`Missing key for ${name}`);
    stores.get(name).set(key, structuredClone(value));
    return key;
  }),
  delete: key => request(() => stores.get(name)?.delete(key))
});
const db = {
  objectStoreNames: { contains: name => stores.has(name) },
  createObjectStore(name, options = {}) {
    stores.set(name, new Map());
    definitions.set(name, options);
    return objectStore(name);
  },
  transaction: name => ({ objectStore: () => objectStore(name) })
};

globalThis.indexedDB = {
  open() {
    const value = {};
    setTimeout(() => {
      value.result = db;
      value.onupgradeneeded?.();
      value.onsuccess?.();
    });
    return value;
  }
};
globalThis.window = globalThis;
globalThis.window.dispatchEvent = () => {};
globalThis.addEventListener = () => {};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, userAgent: 'backup-test', storage: { estimate: async () => ({ usage: 4096, quota: 1048576 }), persisted: async () => false, persist: async () => true } } });
globalThis.location = { origin: 'https://example.test', search: '', hash: '', pathname: '/' };
globalThis.history = { replaceState() {} };
globalThis.matchMedia = () => ({ matches: false });
globalThis.CustomEvent ||= class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };
globalThis.FileReader = class FileReader {
  readAsDataURL(blob) {
    blob.arrayBuffer().then(buffer => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onload?.();
    }, error => { this.error = error; this.onerror?.(); });
  }
};
window.YeogiroData = {
  backupSummary(state) {
    const trips = state.trips || [];
    return {
      trips: trips.length,
      items: trips.reduce((sum, trip) => sum + (trip.items || []).length, 0),
      flights: trips.reduce((sum, trip) => sum + (trip.flights || []).length, 0),
      lodgings: trips.reduce((sum, trip) => sum + (trip.lodgings || []).length, 0),
      documents: trips.reduce((sum, trip) => sum + (trip.items || []).reduce((n, item) => n + (item.userDocs || []).length, 0), 0)
    };
  }
};

await import('../sync.js');
const store = window.YeogiroStore;
const tripId = 'trip_roundtrip';
const itemId = 'item_roundtrip';
const [documentMeta] = await store.addFiles([
  new File(['reservation-original'], 'reservation.pdf', { type: 'application/pdf' })
], 'item', itemId);
const heroMeta = await store.setHero(new Blob(['hero-original'], { type: 'image/jpeg' }), tripId);
const sourceState = {
  activeId: tripId,
  trips: [{
    id: tripId, title: '왕복 테스트 여행', start: '2026-08-23', end: '2026-08-24', note: '', cities: ['서울'],
    hero: '', heroFileId: heroMeta.id, files: [documentMeta, heroMeta], flights: [], lodgings: [],
    expenses: [{ id: 'expense_source', title: '함께 먹은 저녁', category: '식비', amountMinor: 30000, currency: 'KRW', baseCurrency: 'KRW', rateMicros: 1000000, convertedMinor: 30000, rateUpdatedAt: '', rateSource: 'same-currency', paidByMemberId: 'mem_old_owner', shareMemberIds: ['mem_old_owner', 'mem_old_guest'], spentAt: '2026-08-23', memo: '', linkedType: 'item', linkedId: itemId }],
    expenseMembers: [{ id: 'mem_old_owner', name: '이전 소유자', role: 'owner', revokedAt: '' }],
    expenseSettings: { baseCurrency: 'KRW', budgetMinor: 500000, settledAt: '2026-08-24T00:00:00.000Z', settlementFingerprint: 'old' },
    items: [{ id: itemId, day: '2026-08-23', time: '10:00', endTime: '', preparationMinutes: 0, cat: '기타', name: '예약 일정', place: '', mapUrl: '', memo: '', move: '', alarm: '', reservationNumber: '', provider: '', lat: null, lng: null, userDocs: [documentMeta] }]
  }]
};

const readiness = await store.backupReadiness(sourceState);
assert.equal(readiness.included, 2, 'document and hero originals are ready for backup');
assert.equal(readiness.missing, 0, 'no original is missing before export');

const backup = await store.exportBackup(sourceState);
assert.equal(backup.fileSummary.included, 2, 'backup records both embedded originals');
assert.match(backup.state.trips[0].items[0].userDocs[0].data, /^data:application\/pdf;base64,/, 'document is embedded');
assert.match(backup.state.trips[0].heroData, /^data:image\/jpeg;base64,/, 'hero image is embedded');

stores.get('files').clear();
const unrelated = { id: 'trip_existing', title: '기존 여행', start: '2026-08-20', end: '2026-08-20', cities: [], items: [], flights: [], lodgings: [], files: [], heroFileId: '' };
const restored = await store.importBackup(backup, { mode: 'overwrite', current: { activeId: unrelated.id, trips: [unrelated] } });
const restoredTrip = restored.trips.find(trip => trip.title === '왕복 테스트 여행');
const restoredDocId = restoredTrip.items[0].userDocs[0].id;
assert.equal(await (await store.fileBlob(restoredDocId)).text(), 'reservation-original', 'document blob is restored into IndexedDB');
assert.equal(await (await store.fileBlob(restoredTrip.heroFileId)).text(), 'hero-original', 'hero blob is restored into IndexedDB');
assert.ok(restored.trips.some(trip => trip.id === unrelated.id), 'unrelated current trips survive restore');

const importedAsNew = await store.importBackup(backup, { mode: 'new', current: restored });
const matchingTrips = importedAsNew.trips.filter(trip => trip.title === '왕복 테스트 여행');
assert.equal(matchingTrips.length, 2, 'conflicting backup can be imported as a separate trip');
assert.notEqual(matchingTrips[0].id, matchingTrips[1].id, 'new-trip import remaps the trip id');
assert.notEqual(matchingTrips[0].items[0].userDocs[0].id, matchingTrips[1].items[0].userDocs[0].id, 'new-trip import remaps document ids');
assert.equal(await (await store.fileBlob(matchingTrips[1].items[0].userDocs[0].id)).text(), 'reservation-original', 'remapped document original remains readable');

const remappedExpenseTrip = matchingTrips.find(trip => trip.id !== restoredTrip.id);
const remappedExpense = remappedExpenseTrip.expenses[0];
assert.notEqual(remappedExpense.id, 'expense_source', 'new-trip import remaps expense ids');
assert.equal(remappedExpense.paidByMemberId, 'local:self', 'remapped expense payer falls back to this device participant');
assert.deepEqual(remappedExpense.shareMemberIds, ['local:self'], 'remapped expense shares fall back to this device participant');
assert.equal(remappedExpense.linkedId, remappedExpenseTrip.items[0].id, 'remapped expense keeps its schedule link');
assert.equal(remappedExpense.amountMinor, 30000, 'remapped expense keeps the original amount');
assert.deepEqual(remappedExpenseTrip.expenseMembers, [], 'remapped trip drops stale server participants');
assert.equal(remappedExpenseTrip.expenseSettings.settledAt, '', 'remapped trip clears the previous settlement state');
assert.equal(remappedExpenseTrip.expenseSettings.budgetMinor, 500000, 'remapped trip keeps the trip budget');
assert.equal(restoredTrip.expenses[0].paidByMemberId, 'mem_old_owner', 'overwrite restore keeps the original payer');

const remappedDoc = matchingTrips[1].items[0].userDocs[0];
remappedDoc.size = 999;
let audit = await store.auditFiles(matchingTrips[1]);
assert.equal(audit.find(file => file.id === remappedDoc.id).reason, 'metadata', 'audit detects stale local metadata');
assert.equal(await store.repairFileMetadata(matchingTrips[1]), 1, 'metadata repair counts each original once');
assert.equal(remappedDoc.size, new Blob(['reservation-original']).size, 'metadata repair uses the actual blob size');
stores.get('files').delete(remappedDoc.id);
audit = await store.auditFiles(matchingTrips[1]);
assert.equal(audit.find(file => file.id === remappedDoc.id).reason, 'missing', 'audit treats a metadata-only document as a normal missing-original state');
const safety = await store.dataSafety(matchingTrips[1]);
assert.equal(safety.storage.supported, true, 'storage estimate is included when the browser supports it');
assert.equal(safety.storage.persisted, false, 'persistent-storage state is reported without requesting permission');
assert.equal(safety.storage.canPersist, true, 'persistent-storage capability is reported separately');

const beforeInvalid = structuredClone(importedAsNew);
assert.throws(() => store.previewBackup({ format: 'yeogiro-backup-v2', state: { trips: [] } }, importedAsNew), /여행 데이터/);
assert.deepEqual(importedAsNew, beforeInvalid, 'invalid restore preview does not mutate current data');

console.log('30 backup round-trip checks passed');
