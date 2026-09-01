(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YeogiroTravel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CATEGORY_MINUTES = {
    항공: 120,
    숙소: 30,
    식당: 90,
    카페: 60,
    명소: 90,
    이동: 30,
    쇼핑: 60,
    기타: 60
  };

  function timeMinutes(value) {
    if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return null;
    const [hour, minute] = value.split(':').map(Number);
    return hour < 24 && minute < 60 ? hour * 60 + minute : null;
  }

  function formatClock(minutes) {
    const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
  }

  function formatDuration(minutes) {
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    const hours = Math.floor(value / 60), rest = value % 60;
    return hours ? `${hours}시간${rest ? ` ${rest}분` : ''}` : `${rest}분`;
  }

  function categoryDuration(item) {
    const stored = Number(item?.durationMinutes);
    return Number.isFinite(stored) && stored > 0 ? stored : (CATEGORY_MINUTES[item?.cat] || CATEGORY_MINUTES.기타);
  }

  function scheduleState(items, nowMinutes, options = {}) {
    const maxInferredGap = options.maxInferredGap ?? 240;
    const now = Number.isFinite(nowMinutes) ? nowMinutes : 0;
    const sorted = [...(items || [])].filter(item => timeMinutes(item.time) !== null).sort((a, b) => a.time.localeCompare(b.time));
    const entries = sorted.map((item, index) => {
      const start = timeMinutes(item.time), explicitEnd = timeMinutes(item.endTime), nextStart = timeMinutes(sorted[index + 1]?.time);
      let end = explicitEnd !== null && explicitEnd > start ? explicitEnd : null, endSource = end !== null ? 'explicit' : 'estimated';
      if (end === null && nextStart !== null && nextStart > start && nextStart - start <= maxInferredGap) {
        end = nextStart;
        endSource = 'next';
      }
      if (end === null) end = Math.min(1440, start + categoryDuration(item));
      const status = now < start ? 'upcoming' : now < end ? 'current' : 'past';
      return { item, start, end, endSource, status };
    });
    const current = entries.find(entry => entry.status === 'current') || null;
    const next = entries.find(entry => entry.start > now) || null;
    if (next) next.status = 'next';
    const lastPast = [...entries].reverse().find(entry => entry.status === 'past') || null;
    return {
      entries,
      current,
      next,
      lastPast,
      empty: entries.length === 0,
      ended: entries.length > 0 && !current && !next,
      nowMinutes: now
    };
  }

  function moveProfile(move) {
    const value = String(move || '도보');
    if (/도보/.test(value)) return { key: 'walking', label: '도보', icon: '🚶', googleMode: 'walking', routable: true };
    if (/자전거/.test(value)) return { key: 'cycling', label: '자전거', icon: '🚲', googleMode: 'bicycling', routable: true };
    if (/자동차|택시/.test(value)) return { key: 'driving', label: /택시/.test(value) ? '택시' : '자동차', icon: '🚕', googleMode: 'driving', routable: true };
    if (/지하철|버스|트램|대중교통/.test(value)) return { key: 'transit', label: value, icon: '🚌', googleMode: 'transit', routable: false };
    if (/기차/.test(value)) return { key: 'train', label: '기차', icon: '🚆', googleMode: 'transit', routable: false };
    if (/항공/.test(value)) return { key: 'flight', label: '항공', icon: '✈️', googleMode: '', routable: false };
    return { key: 'unknown', label: value || '이동', icon: '→', googleMode: '', routable: false };
  }

  function routeBase(profileKey) {
    return {
      driving: 'https://routing.openstreetmap.de/routed-car',
      walking: 'https://routing.openstreetmap.de/routed-foot',
      cycling: 'https://routing.openstreetmap.de/routed-bike'
    }[profileKey] || '';
  }

  function geoDistance(a, b) {
    if (![a?.lat, a?.lng, b?.lat, b?.lng].every(Number.isFinite)) return null;
    const radius = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * radius * Math.asin(Math.sqrt(value));
  }

  function fallbackLeg(a, b) {
    const profile = moveProfile(b?.move), directKm = geoDistance(a, b);
    if (directKm === null) return { ...profile, distanceKm: null, durationMinutes: null, estimated: true, geometry: [] };
    const speed = { walking: 4.5, cycling: 15, driving: 30, transit: 24, train: 70 }[profile.key];
    const factor = { walking: 1.22, cycling: 1.18, driving: 1.3, transit: 1.25, train: 1.08 }[profile.key] || 1;
    const distanceKm = directKm * factor;
    const durationMinutes = speed ? Math.max(1, Math.round(distanceKm / speed * 60)) : null;
    return { ...profile, distanceKm, durationMinutes, estimated: true, geometry: [[a.lat, a.lng], [b.lat, b.lng]] };
  }

  function assessGap(from, to, leg, options = {}) {
    const nextStart = timeMinutes(to?.time), fromStart = timeMinutes(from?.time);
    if (nextStart === null || fromStart === null || !Number.isFinite(leg?.durationMinutes)) return { level: 'unknown', slackMinutes: null, departureMinutes: null };
    const preparationMinutes = Math.max(0, Number(options.preparationMinutes ?? to?.preparationMinutes) || 0);
    const explicitEnd = timeMinutes(from?.endTime), expectedEnd = explicitEnd !== null && explicitEnd > fromStart ? explicitEnd : fromStart + categoryDuration(from);
    const departureMinutes = nextStart - leg.durationMinutes - preparationMinutes;
    const slackMinutes = Math.round(departureMinutes - expectedEnd);
    const reliable = explicitEnd !== null;
    let level = 'comfortable';
    if (slackMinutes < 0 && (reliable || slackMinutes <= -20)) level = 'conflict';
    else if (slackMinutes >= 0 && slackMinutes < 15) level = 'tight';
    return { level, slackMinutes, departureMinutes, expectedEnd, preparationMinutes, reliable };
  }

  function routeSummary(stops, legs) {
    const valid = (legs || []).filter(leg => Number.isFinite(leg?.durationMinutes));
    const expected = Math.max(0, (stops || []).length - 1);
    const complete = valid.length === expected;
    const distance = complete && valid.every(leg => Number.isFinite(leg.distanceKm))
      ? valid.reduce((sum, leg) => sum + leg.distanceKm, 0)
      : null;
    return {
      places: (stops || []).filter(stop => stop.type === 'item').length,
      durationMinutes: complete
        ? valid.reduce((sum, leg) => sum + leg.durationMinutes, 0)
        : null,
      distanceKm: distance,
      complete
    };
  }

  function routeDistance(stops) {
    let total = 0;
    for (let index = 0; index < stops.length - 1; index++) {
      const distance = geoDistance(stops[index], stops[index + 1]);
      if (distance === null) return null;
      total += distance;
    }
    return total;
  }

  function routeSuggestion(items) {
    const source = [...(items || [])];
    if (source.length < 3 || source.some(item => geoDistance(item, item) === null)) return null;
    const currentKm = routeDistance(source);
    if (currentKm === null) return null;
    let best = null;
    for (let index = 0; index < source.length - 1; index++) {
      if (source[index].type !== 'item' || source[index + 1].type !== 'item' || source[index].fixed || source[index + 1].fixed || source[index].endTime || source[index + 1].endTime) continue;
      const candidate = [...source];
      [candidate[index], candidate[index + 1]] = [candidate[index + 1], candidate[index]];
      const candidateKm = routeDistance(candidate);
      const savedKm = currentKm - candidateKm;
      if (savedKm > Math.max(1, currentKm * 0.08) && (!best || savedKm > best.savedKm)) {
        best = { fromIndex: index, toIndex: index + 1, currentKm, candidateKm, savedKm, order: candidate.map(item => item.id) };
      }
    }
    return best;
  }

  function routeWarning(from, to, leg, weather = null) {
    const gap = assessGap(from, to, leg);
    if (gap.level === 'conflict') return { level: 'conflict', text: `이동시간이 약 ${Math.abs(gap.slackMinutes)}분 부족합니다.` };
    if (!Number.isFinite(leg?.durationMinutes)) return { level: 'route', text: '경로를 계산할 수 없습니다.' };
    if (weather?.precipitationProbability >= 60 && moveProfile(to?.move).key === 'walking') {
      return { level: 'weather', text: `도보 이동 중 비 가능성 ${Math.round(weather.precipitationProbability)}% · 차량 이동도 확인해 보세요.` };
    }
    if (!gap.reliable) return { level: 'reference', text: '종료시간이 없어 이동시간만 참고해 주세요.' };
    return null;
  }

  function tripPhase(trip, today) {
    if (today < trip.start) return 'before';
    if (today > trip.end) return 'after';
    return 'during';
  }

  function preferredTripId(trips, today) {
    const list = (trips || []).filter(trip => trip && trip.id && trip.start && trip.end);
    if (!list.length) return '';
    const byPhase = phase => list.filter(trip => tripPhase(trip, today) === phase);
    const during = byPhase('during').sort((a, b) => a.start.localeCompare(b.start));
    if (during.length) return during[0].id;
    const upcoming = byPhase('before').sort((a, b) => a.start.localeCompare(b.start));
    if (upcoming.length) return upcoming[0].id;
    return [...list].sort((a, b) => b.end.localeCompare(a.end))[0].id;
  }

  function flightDayDelta(departDate, arriveDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(departDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(arriveDate || '')) return 0;
    return Math.max(0, Math.round((new Date(`${arriveDate}T00:00:00`) - new Date(`${departDate}T00:00:00`)) / 86400000));
  }

  function terminalInfo(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(?:t(?:erminal)?\s*)?(\d+[a-z]?)$/i) || raw.match(/^제?\s*(\d+[a-z]?)\s*터미널$/i);
    const number = match?.[1]?.toUpperCase();
    return raw
      ? { text: number ? `T${number}` : raw, label: number ? `터미널 ${number}` : `터미널 ${raw}` }
      : { text: '', label: '' };
  }

  return { timeMinutes, formatClock, formatDuration, categoryDuration, scheduleState, moveProfile, routeBase, geoDistance, fallbackLeg, assessGap, routeSummary, routeSuggestion, routeWarning, tripPhase, preferredTripId, flightDayDelta, terminalInfo };
});
