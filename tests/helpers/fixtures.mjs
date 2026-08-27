export function createTestTrip(id, overrides = {}) {
  const baseItem = {
    id: `${id}_item`, day: '2026-08-22', time: '10:00', endTime: '11:15', preparationMinutes: 20,
    cat: '명소', name: '바나힐 일정', place: '바나힐', mapUrl: '', memo: '초기 메모', move: '도보', alarm: '',
    reservationNumber: 'TOUR-123', provider: '투어 운영사', lat: null, lng: null, userDocs: []
  };
  return {
    id, title: '2기기 E2E 여행', start: '2026-08-22', end: '2026-08-24', note: '공유 안정성 검증',
    cities: ['다낭', '호이안'], heroFileId: '', revision: 1,
    items: [baseItem],
    flights: [{ id:`${id}_flight`, airline:"T'way Air", flightNumber:'TW125', departDate:'2026-08-22', arriveDate:'2026-08-22', from:'ICN', fromTerminal:'T1', fromCity:'인천', depart:'07:45', to:'DAD', toTerminal:'T2', toCity:'다낭', arrive:'10:40', reservationNumber:'FL-7788', seat:'', baggage:'15kg', userDocs:[] }],
    lodgings: [{ id:`${id}_lodging`, itemId:'', name:'Grand Signature Resort Hoi An', checkInDate:'2026-08-22', checkInTime:'15:00', checkOutDate:'2026-08-24', checkOutTime:'11:00', address:'Hoi An', reservationNumber:'HT-9090', guests:'2명', room:'Deluxe', breakfast:'포함', memo:'호이안 야경', mapUrl:'', lat:null, lng:null, userDocs:[] }],
    files: [],
    ...overrides
  };
}

export const createOwner = displayName => ({ displayName: displayName || '테스트 소유자', deviceId:'owner-device', deviceName:'PC 브라우저', platform:'Windows', clientType:'browser' });
export const createEditor = displayName => ({ displayName: displayName || '편집 가능 참여자', deviceId:'editor-device', deviceName:'휴대폰 앱', platform:'iOS', clientType:'pwa' });
