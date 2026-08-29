const assert = require('node:assert/strict');
const weather = require('../weather-logic.js');

const trip = {
  start: '2026-08-20',
  cities: ['서울', '부산', '제주'],
  items: [
    { day: '2026-08-20', lat: 37.5665, lng: 126.9780 },
    { day: '2026-08-21', lat: 35.1796, lng: 129.0756 },
    { day: '2026-08-21', lat: 33.4996, lng: 126.5312 }
  ],
  lodgings: [{ checkInDate: '2026-08-22', checkOutDate: '2026-08-23', lat: 33.4890, lng: 126.4983 }]
};

assert.deepEqual(weather.resolveDayLocations(trip, '2026-08-20'), [{ lat: 37.5665, lng: 126.978 }], 'uses schedule coordinates first');
assert.deepEqual(weather.resolveDayLocations(trip, '2026-08-21'), [
  { lat: 35.1796, lng: 129.0756 },
  { lat: 33.4996, lng: 126.5312 }
], 'keeps separate schedule location clusters');
assert.deepEqual(weather.resolveDayLocations(trip, '2026-08-22'), [{ lat: 33.489, lng: 126.4983 }], 'falls back to lodging coordinates');
assert.deepEqual(weather.resolveDayLocations(trip, '2026-08-24'), [], 'does not invent a city outside the trip range');
assert.deepEqual(weather.resolveDayLocations({ start: '2026-08-20', cities: ['서울'], items: [], lodgings: [] }, '2026-08-20'), ['서울'], 'falls back to the explicit city');
assert.deepEqual(weather.resolveDayLocations({ start: '2026-08-20', cities: [], items: [], lodgings: [] }, '2026-08-20'), [], 'returns no location when none is available');

const hours = [{ time: '2026-08-20T09:00' }, { time: '2026-08-20T11:00' }, { time: '2026-08-20T14:00' }];
assert.equal(weather.nearestHourly(hours, '10:20'), hours[1], 'finds the closest hourly forecast');
assert.equal(weather.nearestHourly(hours, 'bad'), null, 'rejects invalid target times');

assert.deepEqual(weather.weatherCode(0), { code: 0, label: '맑음', icon: '☀️' });
assert.equal(weather.weatherCode(95).label, '뇌우');
assert.equal(weather.weatherCode(999).label, '알 수 없음');

let advice = weather.dailyAdvice({ precipitationProbabilityMax: 70, apparentTemperatureMax: 36, windSpeedMax: 50 }, [
  { time: '2026-08-20T14:00', precipitationProbability: 80 }
]);
assert.deepEqual(advice.map(value => value.type), ['precipitation', 'heat'], 'precipitation and heat take priority over wind');
assert.match(advice[0].text, /14:00/, 'uses an hourly time only when hourly precipitation supports it');
advice = weather.dailyAdvice({ precipitationSum: 2 }, []);
assert.doesNotMatch(advice[0].text, /\d{2}:\d{2}/, 'does not invent a specific rain time without hourly evidence');

const normalized = weather.normalizeForecast({
  timezone: 'Asia/Seoul',
  fetchedAt: '2026-08-20T00:00:00Z',
  current: { time: '2026-08-20T09:00', temperature_2m: 28, weather_code: 2 },
  daily: { time: ['2026-08-20', '2026-08-21'], temperature_2m_max: [30], weather_code: [2, 61] },
  hourly: { time: ['2026-08-20T09:00', '2026-08-20T10:00'], temperature_2m: [28], precipitation_probability: [0, 70] }
});
assert.equal(normalized.timezone, 'Asia/Seoul', 'preserves the forecast timezone');
assert.equal(normalized.daily[1].temperatureMax, null, 'aligns missing daily array values as null');
assert.equal(normalized.hourly[1].temperature, null, 'aligns missing hourly array values as null');
assert.equal(normalized.current.weatherCode, 2);

assert.equal(weather.forecastState(normalized, '2026-08-20', { online: true, now: Date.parse('2026-08-20T01:00:00Z') }), 'normal', 'today in a fresh forecast is normal');
assert.equal(weather.forecastState(normalized, '2026-08-21', { online: true, now: Date.parse('2026-08-20T01:00:00Z') }), 'normal', 'future in the range is normal');
assert.equal(weather.forecastState(normalized, '2026-08-22', { online: true }), 'out-of-range');
assert.equal(weather.forecastState(normalized, '2026-08-20', { online: true, now: Date.parse('2026-08-20T08:00:01Z'), maxAgeMs: 3 * 60 * 60 * 1000 }), 'stale');
assert.equal(weather.forecastState(normalized, '2026-08-20', { online: false }), 'offline');
assert.equal(weather.forecastState(null, '2026-08-20', { online: true }), 'missing');

assert.equal(weather.locationKey({ lat: 37.56654, lng: 126.97801 }), 'coord:37.567,126.978');
assert.equal(weather.locationKey('  New   York '), 'city:new york');

console.log('25 weather logic checks passed');
