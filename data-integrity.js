(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YeogiroData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

  function normalize(value) {
    return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  }
  function normalizeFlightNumber(value) { return normalize(value).toUpperCase(); }
  function flightNumberParts(value) {
    const compact = normalizeFlightNumber(value), parts = compact.match(/(?:[A-Z]{2}|[A-Z]\d|\d[A-Z])\d{2,4}/g) || [];
    return parts.join('') === compact ? parts : [];
  }
  function normalizeAirport(value) { return String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); }
  function isValidDate(value) {
    if (!DATE_RE.test(String(value || ''))) return false;
    const [year, month, day] = value.split('-').map(Number), date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
  function isValidTime(value) { return TIME_RE.test(String(value || '')); }
  function similarity(a, b) {
    const left = normalize(a), right = normalize(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
    const bigrams = value => new Set([...value].slice(0, -1).map((x, i) => x + value[i + 1]));
    const aa = bigrams(left), bb = bigrams(right);
    if (!aa.size || !bb.size) return 0;
    let common = 0; for (const token of aa) if (bb.has(token)) common += 1;
    return (2 * common) / (aa.size + bb.size);
  }
  function searchScore(query, fields) {
    const q = normalize(query); if (!q) return 0;
    let best = 0;
    for (const field of fields || []) {
      const value = normalize(field?.value); if (!value) continue;
      const weight = Number(field?.weight) || 1;
      if (value === q) best = Math.max(best, 100 + weight);
      else if (value.startsWith(q)) best = Math.max(best, 75 + weight);
      else if (value.includes(q)) best = Math.max(best, 50 + weight);
    }
    return best;
  }
  function searchTrip(trip, query) {
    const groups = { '일정': [], '항공편': [], '숙소': [], '경비': [], '예약서류': [] }, q = normalize(query);
    if (!q || !trip) return groups;
    const push = (group, result, fields) => { const score = searchScore(q, fields); if (score) groups[group].push({ ...result, score }); };
    for (const item of trip.items || []) push('일정', { type:'item', id:item.id, title:item.name, sub:`${item.day || ''} · ${item.time || ''}${item.place ? ` · ${item.place}` : ''}` }, [
      { value:item.reservationNumber, weight:45 }, { value:item.name, weight:35 }, { value:item.place, weight:28 }, { value:item.provider, weight:22 }, { value:item.memo, weight:5 }
    ]);
    for (const flight of trip.flights || []) push('항공편', { type:'flight', id:flight.id, title:`${flight.flightNumber || '항공편'} · ${flight.from || '—'} → ${flight.to || '—'}`, sub:`${flight.departDate || ''} · ${flight.depart || ''}` }, [
      { value:flight.flightNumber, weight:48 }, { value:flight.reservationNumber, weight:45 }, { value:flight.airline, weight:32 }, { value:flight.from, weight:27 }, { value:flight.to, weight:27 }, { value:flight.fromCity, weight:24 }, { value:flight.toCity, weight:24 }, { value:flight.baggage, weight:4 }
    ]);
    for (const lodging of trip.lodgings || []) push('숙소', { type:'lodging', id:lodging.id, title:lodging.name, sub:`${lodging.checkInDate || ''} 체크인${lodging.address ? ` · ${lodging.address}` : ''}` }, [
      { value:lodging.reservationNumber, weight:45 }, { value:lodging.name, weight:35 }, { value:lodging.address, weight:27 }, { value:lodging.memo, weight:5 }
    ]);
    for (const expense of trip.expenses || []) push('경비', { type:'expense', id:expense.id, title:expense.title || expense.category || '경비', sub:`${expense.spentAt || ''} · ${expense.category || '기타'} · ${expense.currency || ''}` }, [
      { value:expense.title, weight:35 }, { value:expense.category, weight:25 }, { value:expense.memo, weight:4 }
    ]);
    const seen = new Set(), addDocument = (doc, owner, relation) => {
      if (!doc?.id || seen.has(doc.id) || doc.id === trip.heroFileId) return; seen.add(doc.id);
      push('예약서류', { type:'document', id:doc.id, title:doc.name, sub:`${relation}에 연결됨`, relationType:owner?.type || '', relationId:owner?.id || '' }, [
        { value:doc.name, weight:15 }, { value:relation, weight:12 }, { value:owner?.reservationNumber, weight:10 }, { value:owner?.memo, weight:3 }
      ]);
    };
    for (const item of trip.items || []) for (const doc of item.userDocs || []) addDocument(doc, { ...item, type:'item' }, item.name || '일정');
    for (const flight of trip.flights || []) for (const doc of flight.userDocs || []) addDocument(doc, { ...flight, type:'flight' }, `${flight.flightNumber || '항공편'} 항공편`);
    for (const lodging of trip.lodgings || []) for (const doc of lodging.userDocs || []) addDocument(doc, { ...lodging, type:'lodging' }, `${lodging.name || '숙소'} 숙소`);
    for (const doc of trip.files || []) if (doc.entityType === 'trip') addDocument(doc, { ...trip, type:'trip' }, trip.title || '여행');
    for (const list of Object.values(groups)) list.sort((a,b)=>b.score-a.score||String(a.title).localeCompare(String(b.title),'ko'));
    return groups;
  }
  function entityFromExtraction(x) {
    const kind = x?.kind || 'unknown', f = x?.flight || {}, l = x?.lodging || {}, r = x?.reservation || {};
    if (kind === 'flight') return { kind, entity: { ...f, reservationNumber: f.reservationNumber || x.reservationNumber || '' } };
    if (kind === 'lodging') return { kind, entity: { name: l.name || x.title || '', checkInDate: l.checkInDate || x.date || '', checkInTime: l.checkInTime || x.time || '', checkOutDate: l.checkOutDate || x.endDate || '', checkOutTime: l.checkOutTime || '', address: l.address || x.address || x.place || '', reservationNumber: l.reservationNumber || x.reservationNumber || '', room: l.room || '', guests: l.guests || '', breakfast: l.breakfast || '', memo: l.memo || x.memo || '' } };
    return { kind: 'reservation', entity: { name: r.name || x.title || '', day: r.date || x.date || '', time: r.time || x.time || '', place: r.place || x.place || '', address: r.address || x.address || '', reservationNumber: r.reservationNumber || x.reservationNumber || '', provider: r.provider || '', memo: r.memo || x.memo || '' } };
  }
  function flightEntitiesFromExtraction(x) {
    const list = Array.isArray(x?.flights) && x.flights.length ? x.flights : x?.flight ? [x.flight] : [];
    return list.slice(0, 8).map(flight => ({ ...flight, reservationNumber: flight.reservationNumber || x?.reservationNumber || '' }));
  }
  function findCandidates(trip, kind, entity) {
    const matches = [];
    if (kind === 'flight') for (const current of trip?.flights || []) {
      let score = 0;
      if (entity.departDate && current.departDate === entity.departDate) score += 4;
      if (entity.flightNumber && normalizeFlightNumber(current.flightNumber) === normalizeFlightNumber(entity.flightNumber)) score += 5;
      if (entity.from && normalizeAirport(current.from) === normalizeAirport(entity.from)) score += 2;
      if (entity.to && normalizeAirport(current.to) === normalizeAirport(entity.to)) score += 2;
      if (score >= 7) matches.push({ type: 'flight', id: current.id, score, label: `${current.flightNumber || '항공편'} · ${current.from || '—'} → ${current.to || '—'}`, entity: current });
    }
    if (kind === 'lodging') for (const current of trip?.lodgings || []) {
      const nameScore = similarity(current.name, entity.name); let score = nameScore >= .72 ? 6 : 0;
      if (entity.checkInDate && current.checkInDate === entity.checkInDate) score += 4;
      if (entity.checkOutDate && current.checkOutDate === entity.checkOutDate) score += 2;
      if (score >= 8) matches.push({ type: 'lodging', id: current.id, score, label: `숙소 · ${current.name}`, entity: current });
    }
    if (!['flight', 'lodging'].includes(kind)) for (const current of trip?.items || []) {
      let score = current.day === entity.day ? 4 : 0;
      if (entity.time && current.time === entity.time) score += 2;
      if (similarity(current.name, entity.name) >= .66) score += 4;
      if (entity.place && similarity(current.place, entity.place) >= .66) score += 2;
      if (score >= 8) matches.push({ type: 'item', id: current.id, score, label: `${current.day} · ${current.name}`, entity: current });
    }
    return matches.sort((a, b) => b.score - a.score);
  }
  function validateEntity(kind, entity, trip) {
    const errors = [], warnings = [];
    if (kind === 'flight') {
      if (!entity.flightNumber) warnings.push('편명을 확인해 주세요.');
      if (flightNumberParts(entity.flightNumber).length > 1) errors.push('편명이 여러 개로 합쳐져 있습니다. 항공편을 나눠 입력해 주세요.');
      if (!isValidDate(entity.departDate)) errors.push('출발 날짜를 확인해 주세요.');
      if (!isValidDate(entity.arriveDate)) errors.push('도착 날짜를 확인해 주세요.');
      if (isValidDate(entity.departDate) && isValidDate(entity.arriveDate) && entity.arriveDate < entity.departDate) errors.push('도착 날짜는 출발 날짜보다 빠를 수 없습니다.');
      if (isValidDate(entity.departDate) && isValidDate(entity.arriveDate) && (new Date(`${entity.arriveDate}T00:00:00Z`) - new Date(`${entity.departDate}T00:00:00Z`)) / 86400000 > 2) warnings.push('출발일과 도착일 차이가 큽니다. 항공편 날짜를 확인해 주세요.');
      if (!isValidTime(entity.depart)) errors.push('출발 시간을 확인해 주세요.');
      if (!isValidTime(entity.arrive)) errors.push('도착 시간을 확인해 주세요.');
      if (!normalizeAirport(entity.from) || !normalizeAirport(entity.to)) warnings.push('출발·도착 공항코드를 확인해 주세요.');
    } else if (kind === 'lodging') {
      if (!entity.name) errors.push('숙소명을 확인해 주세요.');
      if (!isValidDate(entity.checkInDate) || !isValidDate(entity.checkOutDate)) errors.push('체크인·체크아웃 날짜를 확인해 주세요.');
      if (isValidDate(entity.checkInDate) && isValidDate(entity.checkOutDate) && entity.checkOutDate < entity.checkInDate) errors.push('체크아웃은 체크인보다 빠를 수 없습니다.');
      if (!isValidTime(entity.checkInTime) || !isValidTime(entity.checkOutTime)) errors.push('체크인·체크아웃 시간을 확인해 주세요.');
    } else {
      if (!entity.name) errors.push('예약명을 확인해 주세요.');
      if (!isValidDate(entity.day)) errors.push('예약 날짜를 확인해 주세요.');
      if (!isValidTime(entity.time)) errors.push('예약 시간을 확인해 주세요.');
      if (isValidDate(entity.day) && trip && (entity.day < trip.start || entity.day > trip.end)) errors.push('예약 날짜가 여행 기간 밖에 있습니다.');
    }
    return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
  }
  function diffFields(current, next, fields) {
    return (fields || Object.keys(next || {})).filter(key => String(current?.[key] ?? '') !== String(next?.[key] ?? '')).map(key => ({ key, before: current?.[key] ?? '', after: next?.[key] ?? '' }));
  }
  function backupSummary(state) {
    const trips = state?.trips || [], docs = new Set(), files = new Set();
    let items = 0, flights = 0, lodgings = 0, expenses = 0;
    for (const trip of trips) {
      items += (trip.items || []).length; flights += (trip.flights || []).length; lodgings += (trip.lodgings || []).length; expenses += (trip.expenses || []).length;
      for (const entity of [...(trip.items || []), ...(trip.flights || []), ...(trip.lodgings || [])]) for (const doc of entity.userDocs || []) { docs.add(doc.id); files.add(doc.id); }
      for (const file of trip.files || []) files.add(file.id);
      if (trip.heroFileId) files.add(trip.heroFileId);
    }
    return { trips: trips.length, items, flights, lodgings, expenses, documents: docs.size, files: files.size };
  }
  return { normalize, normalizeFlightNumber, flightNumberParts, normalizeAirport, isValidDate, isValidTime, similarity, searchScore, searchTrip, entityFromExtraction, flightEntitiesFromExtraction, findCandidates, validateEntity, diffFields, backupSummary };
});
