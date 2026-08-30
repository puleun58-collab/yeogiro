import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('index.html', 'utf8');
const worker = readFileSync('worker.js', 'utf8');
const sync = readFileSync('sync.js', 'utf8');
const migration = readFileSync('migrations/0010_trip_expenses.sql', 'utf8');
const serviceWorker = readFileSync('sw.js', 'utf8');

// 경비 진입점과 화면 구조
assert.match(source, /data-page="expense"[^>]*>경비</, '여행 안에서 경비 탭으로 진입');
assert.match(source, /<div id="expensePage" class="hide"><\/div>/, '경비 화면 전용 영역 제공');
assert.match(source, /function setPage\(p\)\{[\s\S]*#expensePage[\s\S]*p==='expense'\)renderExpenses\(\)/, '경비 탭 전환 시에만 경비 화면을 그림');
assert.match(source, /\[\['summary','요약'\],\['list','지출'\],\['settlement','정산'\]\][\s\S]{0,200}data-expense-view=/, '요약·지출·정산을 한 화면에서 전환');

// 예산과 초과 안내
assert.match(source, /budget==null\?'':`<div class="expense-progress"/, '예산을 설정하지 않으면 진행률을 표시하지 않음');
assert.match(source, /예산을 \$\{money\(-remaining,base\)\} 초과했습니다\./, '예산 초과를 차단하지 않고 금액으로 안내');
assert.match(source, /예산의 \$\{percent\}% 사용/, '예산 사용률을 보조 정보로 제공');
assert.match(source, /expense-hero-head\{display:flex[\s\S]{0,120}margin-bottom:8px/, '제목과 설정 버튼만 카드 첫 줄에 배치');
assert.match(source, /expense-budget-action\.addline[\s\S]{0,180}margin:0/, '예산 설정 버튼을 작게 만들어 카드 오른쪽 위에 배치');
assert.match(source, /expense-hero-total\{width:100%[\s\S]{0,160}overflow-x:auto/, '큰 경비 금액은 설정 버튼과 분리된 전체 너비 영역 사용');
assert.match(source, /heroAmount\.length>15\?'long':heroAmount\.length>11\?'medium'/, '금액 길이에 따라 글자 크기를 자동 축소');
assert.match(source, /expense-budget-form \.field select,\.expense-budget-form \.field input\{height:56px;min-height:56px/, '기준 통화와 총 예산 입력 높이를 통일');
assert.match(source, /expense-breakdown-row small\{display:block;margin-top:5px/, '참여자명과 결제·부담 정보를 분리해 표시');
assert.match(source, /expense-breakdown-row>b\{min-width:68px;text-align:right/, '참여자 상세와 오른쪽 정산 금액 사이 간격 확보');

// 지출 입력 흐름
assert.match(source, /id="expenseForm"[\s\S]{0,400}amount-field[\s\S]{0,200}name="amount"/, '지출 입력에서 금액을 가장 먼저 노출');
assert.match(source, /name="currency">\$\{currencies\}/, '통화는 지원 목록에서 선택');
assert.match(source, /name="paidByMemberId" required/, '결제자를 필수로 선택');
assert.match(source, /name="shareMemberIds"/, '분담 대상을 참여자별로 선택');
assert.match(source, /function expenseParticipantName\(member,current='',payer=false\)/, '경비 화면에서 권한명이 아닌 참여자 이름을 표시');
assert.match(source, /payer\?'나 \(여행 만든 사람\)':'나'/, '현재 소유자는 결제자와 분담자 문맥에 맞게 표시');
assert.match(source, /genericGuest\|\|!raw\)return'동행자'/, '초대 경로 대신 동행자 문구 사용');
assert.match(source, /x\.payerName\|\|x\.name/, '결제자 선택에는 나와 여행 만든 사람 관계를 함께 안내');
assert.match(source, /선택한 참여자끼리 최소 통화 단위까지 균등하게 나눕니다\./, '균등 분할 정책을 명시');
assert.match(source, /함께 부담할 사람을 한 명 이상 선택해 주세요\./, '분담자 없는 저장을 차단');
assert.match(source, /카드번호 전체를 저장하지 마세요/, '메모에 민감정보 저장을 유도하지 않음');

// 환율 정책
assert.match(source, /data-expense-rate>최신 환율 불러오기/, '최신 환율을 사용자 조작으로만 적용');
assert.match(source, /rateMicrosFromQuote\('100',currency,manual,base\)/, '직접 환율은 100 단위 기준 입력으로 계산');
assert.match(source, /환율 없이 지출을 저장했습니다\./, '환율 조회 실패에도 지출 저장을 허용');
assert.match(source, /rateUpdatedAt\?`<br>환율 기준 \$\{esc\(shortDate\(x\.rateUpdatedAt,true\)\)\}/, '지출에 적용된 환율 기준 시각 표시');
assert.match(source, /x\.rateMicros\?`약 \$\{money\(x\.convertedMinor,base\)\}`:'환율 미적용'/, '환율이 없으면 환산액을 단정하지 않음');
assert.doesNotMatch(source, /convertedMinor:[^,]*Date\.now\(\)/, '과거 지출 환산액을 현재 시각으로 재계산하지 않음');

// 정산
assert.match(source, /settlement\.transfers\.map[\s\S]*fromName\)\} → \$\{esc\(x\.toName/, '정산 결과를 누가 누구에게 형태로 표시');
assert.match(source, /data-settlement-complete>\$\{settled&&!changed\?'정산 완료 취소':'정산 완료 표시'\}/, '정산 완료 상태를 표시하고 되돌릴 수 있음');
assert.match(source, /정산 후 경비가 변경되었습니다\./, '정산 후 변경을 감지해 안내');
assert.match(source, /settlementFingerprint\(trip\(\)\.expenses\)/, '정산 완료 시점의 경비 지문을 저장');

// 권한
assert.match(source, /function expenseCanEdit\(\)\{return YeogiroStore\.status\(\)\.roleByTrip\[trip\(\)\.id\]!=='viewer'\}/, '보기 전용 참여자는 경비를 수정할 수 없음');
assert.match(source, /\['#addItem','#addFlight','#addLodging','#smartImport','#camera','\[data-expense-add\]','\[data-expense-budget\]','\[data-expense-recalc\]','\[data-settlement-complete\]'\]/, '보기 전용에서 경비 편집 진입점 숨김');
assert.match(worker, /async function updateTrip\(request,env,tripId,member\)\{\s*if\(!canEdit\(member\)\)/, '서버에서도 보기 전용 수정 차단');
assert.match(worker, /경비의 결제자 또는 분담자를 찾을 수 없습니다\./, '서버가 경비 참여자 존재를 검증');
assert.match(worker, /경비에 연결한 일정 또는 예약을 찾을 수 없습니다\./, '서버가 경비 연결 대상을 검증');
assert.match(worker, /x\.convertedMinor!==convertedExpenseMinor\(x\)/, '서버가 저장 환율과 환산액 일치를 검증');

// 저장 구조와 마이그레이션
assert.match(migration, /CREATE TABLE expenses[\s\S]*amount_minor INTEGER NOT NULL CHECK \(amount_minor > 0\)/, '금액을 통화 최소 단위 정수로 저장');
assert.match(migration, /exchange_rate_micros INTEGER NOT NULL[\s\S]*converted_minor INTEGER NOT NULL/, '적용 환율과 환산액을 함께 저장');
assert.match(migration, /CREATE TABLE expense_shares[\s\S]*share_minor INTEGER NOT NULL/, '분담을 별도 테이블로 저장');
assert.match(migration, /entity_type TEXT NOT NULL CHECK \(entity_type IN \('trip', 'item', 'flight', 'lodging', 'expense', 'file'\)\)/, '변경 내역에 경비 유형 허용');
assert.match(migration, /entity_type TEXT NOT NULL CHECK \(entity_type IN \('item', 'flight', 'lodging', 'expense', 'file'\)\)/, '휴지통에 경비 유형 허용');
assert.match(worker, /ENTITY_GROUPS=\[\['item','items'\],\['flight','flights'\],\['lodging','lodgings'\],\['expense','expenses'\]\]/, '경비 변경 내역과 휴지통 복원을 기존 구조로 처리');

// 오프라인 동기화
assert.match(sync, /if\(!Array\.isArray\(trip\.expenses\)\)\{trip\.expenses=\[\];changed=true\}/, '기존 여행 데이터에 경비 구조를 안전하게 추가');
assert.match(sync, /delete result\.expenseMembers/, '서버 전용 참여자 정보는 업로드하지 않음');
assert.match(sync, /expense\.paidByMemberId='local:self'/, '새 여행으로 가져온 경비는 이 기기 참여자로 재매핑');
assert.match(worker, /if\(expense\.paidByMemberId==='local:self'\)expense\.paidByMemberId=memberId/, '오프라인 경비를 첫 동기화 때 실제 참여자로 연결');

// 검색 연동
assert.match(source, /type==='expense'\)\{setPage\('expense'\)/, '검색 결과에서 경비로 이동');

// 날씨
assert.match(source, /resolveDayLocations\(t,selected\)/, '선택한 날짜 기준으로 위치를 결정');
assert.match(source, /이 날짜의 지역을 확인할 수 없습니다\./, '위치를 알 수 없으면 추측하지 않음');
assert.match(source, /아직 날씨 예보 기간이 아닙니다\./, '예보 범위를 벗어난 날짜에 가짜 예보를 만들지 않음');
assert.match(source, /날씨 정보를 보려면 인터넷 연결이 필요합니다\./, '캐시가 없는 오프라인 상태를 구분해 안내');
assert.match(source, /stale\?'저장된 날씨 · ':''/, '오래되었거나 오프라인 데이터를 최신처럼 표시하지 않음');
assert.match(source, /날씨 정보를 불러오지 못했습니다\.<\/span><button class="addline" data-weather-retry>다시 시도/, '날씨 실패는 일정 화면과 분리해 재시도 제공');
assert.match(source, /renderTravelGaps\(\);renderWeather\(\)\.catch\(\(\)=>\{\}\)/, '날씨 오류가 일정 렌더링을 막지 않음');
assert.match(source, /details class="weather-hourly"><summary>시간대별 보기/, '시간대별 예보는 접은 상태로 제공');
assert.match(source, /nearestHourly\(hours,item\.time\)/, '일정 시간과 가장 가까운 예보를 연결');
assert.match(source, /weather-item-note">☂ 비 가능성/, '야외 일정에만 보조 강수 정보를 표시');
assert.match(source, /\$\{code\.icon\} \$\{esc\(code\.label\)\}/, '날씨를 아이콘과 글자로 함께 전달');
assert.match(source, /tripPhase\(t,today\)==='after'\)\{node\.remove\(\)/, '종료된 여행에서는 날씨 카드를 노출하지 않음');
assert.match(source, /needsRefresh\(cached,\{now:Date\.now\(\),maxAgeMs:30\*60\*1000,today:iso\(new Date\(\)\)\}\)/, '같은 위치의 반복 호출을 캐시로 차단하되 하루가 지나면 다시 조회');
assert.match(source, /setInterval\(\(\)=>refreshForNewDay\(\),60000\)/, '앱을 켜 둔 상태에서도 날짜가 바뀌면 예보를 다시 불러옴');
assert.match(source, /visibilitychange[\s\S]{0,160}refreshForNewDay\(\)\)renderWeather/, '앱으로 돌아올 때 날씨를 갱신');
assert.match(source, /function pruneWeatherCache\(\)/, '지난 날짜만 담긴 저장 예보는 정리');
assert.match(source, /setupPwa\(\);pruneWeatherCache\(\);render\(\)/, '시작할 때 오래된 예보 캐시를 정리');
assert.match(source, /weatherRequests\.has\(key\)\)return weatherRequests\.get\(key\)/, '동시 렌더에서 중복 요청을 합침');
assert.match(source, /data-weather-location>지역 \$\{weatherLocationIndex\+1\}\/\$\{locations\.length\}/, '하루에 여러 지역이면 출발지와 도착지 날씨를 각각 확인');
assert.match(source, /weatherLocationDay!==selected\)\{weatherLocationDay=selected;weatherLocationIndex=0\}/, '날짜를 바꾸면 지역 선택을 초기화');

// 날씨·환율 서버 경로
assert.match(worker, /url\.pathname==='\/api\/weather'&&request\.method==='GET'/, '날씨 조회는 Worker 경유');
assert.match(worker, /timezone:'auto'/, '현지 시간대 기준 예보를 요청');
assert.match(worker, /forecast_days:'16'/, '예보 가능 기간을 명시적으로 요청');
assert.match(worker, /max-age=1800, stale-while-revalidate=3600/, '날씨 응답에 캐시 정책 적용');
assert.match(worker, /max-age=604800/, '지오코딩 결과를 장기 캐시');
assert.match(worker, /rateLimited\(request,env,'weather',120,600\)/, '날씨 호출량 상한 적용');
assert.match(worker, /rateLimited\(request,env,'exchange-rate',90,600\)/, '환율 호출량 상한 적용');
assert.match(worker, /max-age=21600/, '환율 응답을 6시간 캐시');
assert.match(worker, /현재 환율을 불러오지 못했습니다\. 직접 환율을 입력하거나 나중에 적용해 주세요\./, '환율 실패 시 대안을 안내');
assert.doesNotMatch(source, /api\.open-meteo\.com|frankfurter/, '외부 데이터 API를 클라이언트에서 직접 호출하지 않음');

// 환율 다중 소스와 재계산
assert.match(worker, /const ECB_CURRENCIES=new Set\(\['KRW','JPY','USD','EUR'\]\)/, 'ECB 지원 통화를 명시');
assert.match(worker, /api\.frankfurter\.dev\/v1\/latest\?base=\$\{from\}&symbols=\$\{to\}/, 'ECB 통화쌍은 Frankfurter를 우선 사용');
assert.match(worker, /open\.er-api\.com\/v6\/latest\/\$\{from\}/, 'ECB가 지원하지 않는 통화는 대체 소스로 조회');
assert.match(worker, /async function rateQuote\(from,to\)/, '환율 조회를 단일 함수로 통합');
assert.match(source, /async function applyLatestRates\(base\)/, '최신 환율 일괄 적용 기능 제공');
assert.doesNotMatch(source.match(/async function applyLatestRates\(base\)[\s\S]*?\n\}/)?.[0] || '', /expense\.amountMinor\s*=[^=]|expense\.currency\s*=[^=]/, '재계산은 원래 결제 금액과 통화를 바꾸지 않음');
assert.match(source, /askConfirm\(\{title:changingBase\?'기준 통화 변경':'최신 환율로 다시 계산'/, '재계산 전에 사용자 확인을 받음');
assert.match(source, /최신 환율을 적용하려면 인터넷 연결이 필요합니다\./, '오프라인에서는 재계산을 시도하지 않음');
assert.match(source, /data-expense-recalc>최신 환율로 다시 계산/, '요약 화면에서 최신 환율 재계산 진입');
assert.match(source, /rateResult=oldBase!==base\?await refreshExpenseRates\(base,true\)/, '기준 통화를 바꾸면 기존 지출을 함께 재계산');

// 예약서류 AI 결제 금액 후보
assert.match(worker, /"payment":\{"amount":"","currency":""\}/, 'AI 추출 형식에 결제 금액을 포함');
assert.match(worker, /payment:\{amount:\/\^\\d\{1,15\}/, '결제 금액과 통화를 서버에서 검증');
assert.match(source, /function expenseCandidateSheet\(prefill\)/, '예약서 금액을 경비 후보로만 제안');
assert.match(source, /자동으로 저장하지 않습니다\./, 'AI가 찾은 금액을 자동 확정하지 않음');
assert.match(source, /data-expense-candidate>경비에 추가/, '사용자가 직접 경비 추가를 선택');
assert.match(source, /expenseCandidate=x\?\.payment\?\.amount&&x\?\.payment\?\.currency/, '결제 금액과 통화가 모두 있을 때만 후보 생성');

assert.match(worker, /const CITY_ALIASES=\{'서울':'Seoul\|KR'/, '한국어 도시명을 국가까지 지정해 좌표로 변환');
assert.match(worker, /countryCode\?\`&countryCode=/, '동명 도시 오인을 막기 위해 국가 코드로 조회 범위를 제한');
assert.match(worker, /CITY_ALIASES\[city\]\|\|city/, '별칭이 없으면 입력한 도시명을 그대로 조회');

// PWA 자산
assert.match(serviceWorker, /'\/expense-logic\.js\?v=58'/, '경비 로직을 오프라인 캐시에 포함');
assert.match(serviceWorker, /'\/weather-logic\.js\?v=58'/, '날씨 표시 로직을 오프라인 캐시에 포함');

console.log('103 expense and weather integration checks passed');
