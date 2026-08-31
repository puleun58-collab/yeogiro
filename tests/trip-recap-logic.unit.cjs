const assert=require('node:assert/strict');
const r=require('../trip-recap-logic.js');

// phase boundaries
assert.equal(r.phaseOf({start:'2026-09-01',end:'2026-09-03'},'2026-08-31'),'before');
assert.equal(r.phaseOf({start:'2026-09-01',end:'2026-09-03'},'2026-09-01'),'during');
assert.equal(r.phaseOf({start:'2026-09-01',end:'2026-09-03'},'2026-09-03'),'during');
assert.equal(r.phaseOf({start:'2026-09-01',end:'2026-09-03'},'2026-09-04'),'after');

// grouping and sorting
let trips=[
  {id:'a',title:'제주도',start:'2026-11-19',end:'2026-11-22'},
  {id:'b',title:'다낭',start:'2025-05-01',end:'2025-05-04'},
  {id:'c',title:'부산',start:'2025-01-01',end:'2025-01-03'},
  {id:'d',title:'일본',start:'2026-12-01',end:'2026-12-05'},
  {id:'e',title:'서울',start:'2026-11-20',end:'2026-11-25'},
];
let groups=r.groupTrips(trips,'2026-11-23');
assert.deepEqual(groups.ongoing.map(x=>x.id),['e']);
assert.deepEqual(groups.upcoming.map(x=>x.id),['d']);
assert.deepEqual(groups.past.map(x=>x.id),['a','b','c']);

// visited places dedupe with counts, only located items, first-occurrence order
let items=[
  {day:'2026-11-19',time:'10:00',place:'성산일출봉',lat:33.4,lng:126.9},
  {day:'2026-11-19',time:'12:00',place:'우도',lat:33.5,lng:126.95},
  {day:'2026-11-20',time:'09:00',place:'성산일출봉',lat:33.4,lng:126.9},
  {day:'2026-11-20',time:'15:00',name:'무명 장소',lat:null,lng:null},
];
let places=r.visitedPlaces(items);
assert.deepEqual(places,[{label:'성산일출봉',count:2},{label:'우도',count:1}]);

// day groups reuse itinerary, sorted by time within day
let days=r.dayGroups(items,'2026-11-19','2026-11-20');
assert.equal(days.length,2);
assert.equal(days[0].dayNo,1);
assert.deepEqual(days[0].items.map(x=>x.place),['성산일출봉','우도']);
assert.equal(days[1].dayNo,2);

// distance summary: honest partial labeling
let distanceItems=[
  {day:'2026-11-19',time:'09:00',lat:33.4,lng:126.9},
  {day:'2026-11-19',time:'11:00',lat:33.5,lng:126.95},
  {day:'2026-11-19',time:'13:00',lat:null,lng:null},
];
let distance=r.distanceSummary(distanceItems);
assert.ok(distance.km>0);
assert.equal(distance.partial,true);
assert.equal(r.distanceSummary([{day:'2026-11-19',time:'09:00',lat:1,lng:1}]),null);

// flights and lodgings summaries omit sensitive fields
let flights=r.flightsSummary([{id:'f1',airline:'KE',flightNumber:'KE123',from:'GMP',to:'CJU',reservationNumber:'SECRET'}]);
assert.deepEqual(flights,[{id:'f1',label:'KE123',route:'GMP → CJU'}]);
assert.ok(!('reservationNumber' in flights[0]));

let lodgings=r.lodgingsSummary([{id:'l1',name:'제주신라호텔',checkInDate:'2026-11-19',checkOutDate:'2026-11-21',reservationNumber:'SECRET'}]);
assert.deepEqual(lodgings,[{id:'l1',name:'제주신라호텔',nights:2}]);
assert.ok(!('reservationNumber' in lodgings[0]));

// settlement badge
assert.equal(r.settlementBadge({transfersCount:0}),null);
assert.equal(r.settlementBadge({transfersCount:2,settledAt:'',fingerprint:'a',storedFingerprint:''}),'unsettled');
assert.equal(r.settlementBadge({transfersCount:2,settledAt:'2026-11-23',fingerprint:'a',storedFingerprint:'a'}),'settled');
assert.equal(r.settlementBadge({transfersCount:2,settledAt:'2026-11-23',fingerprint:'a',storedFingerprint:'b'}),'unsettled');

// participants label
assert.equal(r.participantsLabel([]),'');
assert.equal(r.participantsLabel([{id:'m1',name:'나'}]),'');
assert.equal(r.participantsLabel([{id:'m1',name:'나'},{id:'m2',name:'하건'}]),'하건 외 1명');
assert.equal(r.participantsLabel([{id:'m1',name:'이전 참여자'},{id:'m2',name:'이전 참여자'}]),'2명 여행');

// duplicate trip: relative-day itinerary shift, sensitive fields stripped, checklist reset
let source={
  id:'src',title:'제주도 여행',start:'2026-11-19',end:'2026-11-22',cities:['제주'],
  items:[
    {id:'i1',day:'2026-11-19',time:'10:00',name:'성산일출봉',reservationNumber:'RES1',provider:'투어사',userDocs:[{id:'doc1'}]},
    {id:'i2',day:'2026-11-20',time:'09:00',name:'우도'},
    {id:'i3',day:'2026-11-22',time:'09:00',name:'마지막날 일정'},
  ],
  checklist:[{id:'c1',title:'상비약',scope:'personal',completed:true,important:true}],
  expenseSettings:{baseCurrency:'KRW'},
};
let idSeq=0,idFactory=()=>`new-${++idSeq}`;
let {trip:dup,skippedItems}=r.duplicateTrip({source,newId:'dst',newTitle:'제주도 여행 다시',newStart:'2027-03-01',newEnd:'2027-03-03',idFactory,includeItinerary:true,includeChecklist:true});
assert.equal(dup.title,'제주도 여행 다시');
assert.deepEqual(dup.cities,['제주']);
assert.equal(dup.items.length,2);
assert.equal(skippedItems,1);
assert.equal(dup.items[0].day,'2027-03-01');
assert.equal(dup.items[1].day,'2027-03-02');
assert.equal(dup.items[0].reservationNumber,'');
assert.equal(dup.items[0].provider,'');
assert.deepEqual(dup.items[0].userDocs,[]);
assert.equal(dup.checklist.length,1);
assert.equal(dup.checklist[0].completed,false);
assert.notEqual(dup.checklist[0].id,'c1');
assert.equal(dup.flights.length,0);
assert.equal(dup.lodgings.length,0);
assert.equal(dup.expenses.length,0);

let noChecklist=r.duplicateTrip({source,newId:'dst2',newTitle:'제주도 여행 다시2',newStart:'2027-03-01',newEnd:'2027-03-05',idFactory,includeItinerary:true,includeChecklist:false});
assert.equal(noChecklist.trip.checklist.length,0);
assert.equal(noChecklist.skippedItems,0);

console.log('37 trip recap logic checks passed');
