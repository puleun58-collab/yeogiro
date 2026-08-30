import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('index.html', 'utf8');
const worker = readFileSync('worker.js', 'utf8');
const sync = readFileSync('sync.js', 'utf8');
const travel = readFileSync('travel-logic.js', 'utf8');
const migration = readFileSync('migrations/0011_item_route_controls.sql', 'utf8');
const sw = readFileSync('sw.js', 'utf8');

assert.match(source, /data-page="overview"[^>]*>동선</, '기존 오버뷰 탭을 동선 화면으로 재사용');
assert.match(source, /id="map"[\s\S]{0,300}routeSvg[\s\S]{0,200}mapMarks/, '하루 전체 지도와 경로 레이어 제공');
assert.match(source, /function dayRouteStops\(\)/, '선택 날짜의 지도 정류장을 한 곳에서 구성');
assert.match(source, /type:'item'/, '일정 정류장 포함');
assert.match(source, /type:'lodging'/, '숙소 정류장 포함');
assert.match(source, /type:'airport'/, '실제 항공편 날짜의 공항 정류장 포함');
assert.match(source, /AIRPORT_COORDS=/, '지원 공항의 검증된 좌표 사용');
assert.match(source, /flight\.arriveDate===selected/, '도착일에 도착 공항 연결');
assert.match(source, /flight\.departDate===selected/, '출국일에 출발 공항 연결');
assert.match(source, /move:'항공',fixed:true/, '출발 공항과 도착 공항 사이는 지상 OSRM 경로로 계산하지 않음');
assert.match(source, /events\]\.sort\(\(a,b\)=>\(a\.time/, '같은 날 출발·도착도 항공편 시간순으로 배치');
assert.match(source, /id="includeLodgingReturn"/, '숙소 복귀는 선택 옵션');
assert.match(source, /includeLodgingReturn&&lodging/, '복귀 선택 때만 마지막 숙소 추가');

assert.match(source, /<div class="pin-dot">\$\{i\.type==='lodging'\?'⌂':i\.type==='airport'\?'✈':n\+1\}/, '일정 번호와 숙소·공항 표식 구분');
assert.match(source, /fitMap\(list\)/, '하루 전체 위치를 기준으로 지도 범위 조정');
assert.match(source, /class="pin[^`]*active/, '선택한 마커 강조');
assert.match(source, /data-pin="\$\{i\.id\}"/, '마커와 정류장 ID 연결');
assert.match(source, /data-route-stop="\$\{esc\(stop\.id\)\}"/, '동선 목록에서 같은 정류장 선택 가능');
assert.match(source, /journeyDetail/, '선택 정류장 상세 영역 제공');
assert.match(source, /다음 이동/, '선택 지점의 다음 이동정보 표시');

assert.match(source, /routeBase\(profile\.key\)/, '기존 라우팅 프로필 재사용');
assert.match(travel, /routing\.openstreetmap\.de/, '라우팅 주소는 travel logic의 기존 OSRM 계열 사용');
assert.match(source, /fetch\('\/api\/route\?'\+params\)/, '브라우저 CORS 차이를 피하도록 Worker 경유');
assert.match(worker, /async function routeForecast\(request,env,url\)/, 'Worker에 경로 프록시 제공');
assert.match(worker, /radiuses=5000;5000/, '건물 좌표도 주변 도로에 스냅해 경로 계산');
assert.match(worker, /router\.project-osrm\.org/, '자동차 경로는 기존 OSRM 계열 대체 엔드포인트 제공');
assert.match(source, /result\.geometry\.coordinates\.map/, '직선이 아니라 API 경로 geometry 사용');
assert.match(source, /profile\.routable/, '지원 가능한 이동수단만 자동 라우팅');
assert.match(source, /unsupported:true/, '대중교통 등 미지원 수단은 가짜 시간 없이 구분');
assert.match(source, /외부 지도에서 경로 확인/, '미지원 이동수단은 외부 길찾기로 안내');
assert.match(source, /data-route-dir=/, '각 주요 정류장에서 외부 길찾기 제공');
assert.match(source, /google\.com\/maps\/dir/, '앱 내부 내비게이션 대신 외부 지도 사용');

assert.match(source, /name="move"/, '구간별 이동수단을 다음 일정에 저장');
assert.match(source, /name="moveMinutes"/, '구간 이동시간 수동 설정 지원');
assert.match(source, /draft\.moveMinutes=/, '수동 이동시간을 여행 데이터에 저장');
assert.match(source, /Number\.isInteger\(b\.moveMinutes\)/, '수동값이 자동 라우팅보다 우선');
assert.match(source, /manual:true/, '수동 이동시간 표시 상태 보존');
assert.match(source, /name="fixed"/, '고정 일정 설정 제공');
assert.match(source, /draft\.fixed=fd\.get\('fixed'\)==='on'/, '고정 여부를 여행 데이터에 저장');
assert.match(source, /고정 일정이나 종료시간이 있는 일정은 시간을 직접 편집/, '고정·종료시간 일정의 간편 재배치 차단');

assert.match(source, /routeSummary\(list,routes\)/, '총 이동시간과 거리 계산 결과 재사용');
assert.match(source, /예상 이동/, '실시간 교통으로 오해하지 않는 표현');
assert.match(source, /assessGap\(list\[index-1\],stop,leg\)/, '기존 충돌 판정 재사용');
assert.match(source, /출발 권장/, '다음 시작시간에서 이동·여유시간을 빼 출발 권장 표시');
assert.match(source, /routeWarning/, '경고 우선순위를 순수 로직에서 결정');
assert.match(source, /routeWeather\(stop\)/, '저장된 날씨를 구간 경고에 연결');
assert.match(source, /Intl\.DateTimeFormat\('en-CA',\{timeZone:forecast\.timezone/, '현재·다음 일정과 지금 위치를 여행지 현지 시간대로 계산');
assert.match(source, /routeSuggestion\(list\)/, '숙소·공항을 포함한 전체 동선으로 개선 제안 계산');
assert.match(source, /추천 순서 적용/, '사용자 확인으로만 추천 순서 적용');
assert.match(source, /askConfirm\(\{title:'추천 순서 적용'/, '자동 재배치 금지');
assert.match(source, /routeCache\.clear\(\);save\(\);render/, '순서 변경 후 경로·충돌·합계 재계산');

assert.match(source, /routeCacheGet\(key\)/, '메모리 전에 IndexedDB 경로 캐시 확인');
assert.match(source, /routeCachePut\(key,leg\)/, '계산한 경로를 IndexedDB 캐시에 저장');
assert.match(source, /Date\.now\(\)-memory\.savedAt<7\*86400000/, '메모리 경로 캐시도 유효기간 검증');
assert.match(sync, /route:\$\{key\}/, '경로 캐시는 영구 여행 데이터와 분리');
assert.match(sync, /7\*86400000/, '경로 캐시에 유한 만료 정책 적용');
assert.match(source, /offline:!navigator\.onLine/, '오프라인 캐시 결과 상태 표시');
assert.match(source, /저장된 이동시간/, '오프라인 이동시간을 최신처럼 표시하지 않음');
assert.match(source, /새 경로 계산은 인터넷 연결이 필요합니다\./, '오프라인 재계산 차단');
assert.match(source, /id="routeRetry"/, '라우팅 장애 재시도 제공');
assert.match(source, /durationMinutes:null,distanceKm:null,failed:true/, 'API 실패 시 추정값을 실제 경로처럼 표시하지 않음');
assert.match(source, /src="\/api\/map-tile\/\$\{z\}\/\$\{x\}\/\$\{y\}\.png"/, '지도 타일을 Worker 프록시로 안정적으로 조회');
assert.match(source, /data-direct="https:\/\/tile\.openstreetmap\.org/, '타일 프록시 실패 시 기존 OSM 직접 요청으로 대체');
assert.match(source, /route-summary>span\{display:grid[\s\S]{0,100}gap:5px/, '장소 수와 경로 상태 문구 사이 간격 확보');

assert.match(source, /위치 없음 · \$\{missing\.length\}개/, '좌표 없는 일정도 동선 목록에서 유지');
assert.match(source, /data-route-location=/, '좌표 없는 일정의 위치 설정 진입');
assert.match(source, /draft\.place!==oldPlace[\s\S]{0,80}draft\.lat=null/, '주소 변경 시 이전 좌표 무효화');
assert.match(source, /if\(draft\.address!==old\?\.address\)/, '숙소 주소 변경 시 좌표 무효화');

assert.match(worker, /fixed:Boolean\(x\.fixed\)/, '서버가 고정 일정 값을 정규화');
assert.match(worker, /moveMinutes:Number\.isSafeInteger/, '서버가 수동 이동시간 범위를 검증');
assert.match(worker, /fixed_schedule,move_minutes/, 'D1 저장 구문에 동선 필드 포함');
assert.match(migration, /fixed_schedule INTEGER NOT NULL DEFAULT 0/, '고정 일정 D1 마이그레이션');
assert.match(migration, /move_minutes INTEGER CHECK/, '수동 이동시간 D1 마이그레이션');
assert.match(sync, /item\.fixed=false/, '기존 로컬 일정에 안전한 기본값 추가');
assert.match(source, /role!=='viewer'\?`<button data-route-shift/, 'viewer에게 순서 편집 버튼 미노출');
assert.match(source, /보기 전용 참여자는 일정 순서를 변경할 수 없습니다\./, '직접 이벤트에서도 viewer 수정 차단');
assert.match(worker, /if\(!canEdit\(member\)\)return json\(\{error:'보기 전용 여행은 수정할 수 없습니다\.'/,'서버 revision 업데이트 권한 유지');
assert.match(sw, /url\.hostname === 'tile\.openstreetmap\.org'/, '기존 지도 타일 캐시 유지');
assert.match(sw, /url\.pathname\.startsWith\('\/api\/map-tile\/'\)/, '프록시 지도 타일도 제한된 오프라인 캐시에 저장');

console.log('79 route optimization integration checks passed');
