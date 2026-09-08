# 여기로 데이터 흐름 감사

- 감사 기준일: 2026-09-07
- 코드 기준: 현재 저장소의 `worker.js`, `sync.js`, `index.html`, `sw.js`, `wrangler.jsonc`, `migrations/0001`~`0015`
- 정책 버전: 1.0
- 상태: 개발·운영 검토용. 법률 자문이 아니며, `[[...]]` 항목은 운영자가 확인해야 한다.

## 1. 서비스와 저장소 경계

여기로는 여행 일정, 항공편, 숙소, 경비, 준비 체크리스트, 공유 권한을 관리하는 PWA다.

- 브라우저: IndexedDB, localStorage, sessionStorage, Cache Storage에 여행 캐시·원본 파일·환경설정을 저장한다.
- Cloudflare Worker: 같은 출처 API, 접근권한 확인, 외부 데이터 API 프록시, 예약 문서 AI 분석을 처리한다.
- Cloudflare D1: 계정, 여행, 공유 권한, 동기화 데이터, 압축 대표사진, 보안 이벤트를 저장한다.
- Cloudflare Workers AI: 사용자가 명시적으로 선택한 예약 문서의 텍스트 변환과 구조화 추출을 처리한다.
- 외부 제공자: Google OAuth, Open-Meteo, OpenStreetMap 계열 서비스, Frankfurter, ExchangeRate-API를 기능별로 사용한다.

분석·광고·마케팅 SDK, 결제 처리, 비밀번호 인증, 연락처 업로드, 기기 GPS API는 코드에서 확인되지 않았다.

## 2. 코드 기반 처리 목록

| 데이터 | 발생 경로 | 브라우저 저장 | 서버 저장 | 제공·처리 대상 | 보유 기준 | 사용자 통제 | 코드 근거 |
|---|---|---|---|---|---|---|---|
| Google 계정 식별자(`sub`), 표시명, 이메일, 프로필 사진 URL, 이메일 확인 여부 | Google 로그인 | 화면 표시용 메모리 | D1 `accounts`, `auth_identities` | Google OAuth, Cloudflare | 계정 삭제 시 계정·인증정보 삭제 | 내 정보 → 계정 삭제 | `worker.js` `googleCallback`, `authMe`; `0014_account_auth.sql` |
| 약관·개인정보 처리방침 버전과 동의 시각 | Google 로그인 버튼 계속하기 | 없음 | D1 `accounts` | Cloudflare | 계정 삭제 시 삭제 | 계정 삭제 | `worker.js` `POLICY_VERSION`, `googleStart`, `googleCallback` |
| 계정 로그인 세션 토큰, 기기 ID·이름, OS 계열, 브라우저/PWA 구분, 생성·최근 사용·만료·해지 시각 | 로그인 및 API 요청 | 토큰은 `Secure; HttpOnly` 쿠키라 JS에서 읽지 못함 | 토큰은 SHA-256 해시만 D1 `auth_sessions`에 저장 | Cloudflare | 활성 세션 30일. 만료 즉시 정리 대상. 해지 세션은 최대 30일 후 정리 | 기기별 로그아웃, 다른 기기 전체 로그아웃, 계정 삭제 | `worker.js` `authAccountFor`, `secureCookie`, `purgeExpired`; `0014_account_auth.sql` |
| OAuth state 해시, nonce, PKCE verifier, return path, 기기 메타데이터 | Google 로그인 시작 | state 원문은 10분 HttpOnly 쿠키 | D1 `oauth_transactions` | Google OAuth, Cloudflare | 10분 만료 후 일일 정리 | 로그인 취소 또는 만료 | `worker.js` `googleStart`, `googleCallback`, `purgeExpired` |
| 기존 여행 접근 토큰과 기기 메타데이터 | 계정 도입 전 여행 생성·초대·연결 코드·긴급 복구 | IndexedDB `sessions` | 토큰 해시와 기기 메타데이터를 D1 `sessions`에 저장 | Cloudflare | 여행 삭제 시 삭제. 해지 세션은 최대 30일 후 정리 | 기기 연결 해제, 여행 나가기, 여행 삭제 | `sync.js` `session`; `0006_recovery_and_device_sessions.sql`; `worker.js` `purgeExpired` |
| 여행 기본정보 | 여행 생성·편집 | IndexedDB `cache`, 호환용 localStorage 상태 | D1 `trips` | Cloudflare, 공유 참여자 | 소유자가 여행을 삭제할 때 삭제 | 여행 편집·삭제, JSON 내보내기 | `worker.js` `validateTrip`, `loadTrip`, 여행 DELETE; `0001_cloud_sync.sql` |
| 일정명, 날짜·시간, 장소, 지도 URL, 메모, 이동수단, 알림시각, 준비시간, 좌표, 예약번호·제공자 | 일정 편집 | IndexedDB 여행 캐시 | D1 `items` | Cloudflare, 공유 참여자. 장소 검색 시 OSMF Nominatim. 길찾기 선택 시 Google Maps | 여행 삭제 시 삭제 | 항목 편집·삭제, 휴지통 비우기, 여행 삭제 | `worker.js` `validateTrip`; `0001`, `0004`, `0005`, `0011` migrations; `index.html` `geocode`, `navUrl` |
| 항공사, 편명, 출·도착 날짜·시간·공항·터미널·도시, 예약번호, 좌석, 수하물 | 항공편 편집 또는 문서 분석 결과 적용 | IndexedDB 여행 캐시 | D1 `flights` | Cloudflare, 공유 참여자 | 여행 삭제 시 삭제 | 항공편 편집·삭제, 여행 삭제 | `worker.js` `validateTrip`; `0001_cloud_sync.sql` |
| 숙소명, 체크인·아웃, 주소, 예약번호, 인원, 객실, 조식, 메모, 지도 URL, 좌표 | 숙소 편집 또는 문서 분석 결과 적용 | IndexedDB 여행 캐시 | D1 `lodgings` | Cloudflare, 공유 참여자 | 여행 삭제 시 삭제 | 숙소 편집·삭제, 여행 삭제 | `worker.js` `validateTrip`; `0001_cloud_sync.sql` |
| 경비 제목·종류·금액·통화·환율·결제자·분담자·날짜·메모·연결 항목 | 경비 편집 | IndexedDB 여행 캐시 | D1 `expenses`, `expense_shares` | Cloudflare, 공유 참여자 | 여행 삭제 시 삭제 | 경비 편집·삭제, 여행 삭제 | `worker.js` `validateTrip`; `0010_trip_expenses.sql` |
| 공용 준비 체크리스트와 담당자 | 준비 화면 | IndexedDB 여행 캐시 | D1 `trips.checklist_json` | Cloudflare, 공유 참여자 | 여행 삭제 시 삭제 | 체크리스트 편집·삭제, 여행 삭제 | `0012_trip_checklist.sql`; `index.html` preparation handlers |
| 개인 준비 체크 상태 | 준비 화면 | 여행별 localStorage `yeogiro-prep-personal-*` | 없음 | 없음 | 브라우저 저장소를 지우거나 계정 삭제 화면에서 로컬 데이터 삭제 시 삭제 | 브라우저 데이터 삭제, 계정 삭제 | `index.html` `prepPersonalState`, `savePrepPersonal`; `sync.js` `clearLocalAccountData` |
| 참여자 표시명·역할·최근 사용, 초대 역할·만료·사용 횟수 | 여행 공유 | IndexedDB 여행 캐시에 일부 표시 | D1 `members`, `invites` | Cloudflare, 해당 여행 참여자 | 여행 삭제 시 삭제. 계정 삭제 시 해당 참여자를 `탈퇴한 사용자`로 익명화하고 권한 해지 | 표시명 변경, 권한 변경, 여행 나가기, 계정 삭제 | `worker.js` sharing functions; `0001_cloud_sync.sql`, `0014_account_auth.sql` |
| 초대 토큰, 기기 연결 코드, 긴급 복구 코드 | 공유·기기 연결·긴급 복구 | URL/sessionStorage 또는 사용자 보관. 기존 접근 토큰은 IndexedDB | 서버에는 해시만 저장 | Cloudflare, 링크를 받은 사람 | 초대 설정 만료/취소/여행 삭제, 연결 코드 15분 또는 1회, 복구 코드는 재발급/여행 삭제까지 | 초대 취소, 코드 재발급, 여행 삭제 | `worker.js` `createInvite`, `issueDeviceLink`, `issueRecoveryKey`; migrations `0001`, `0006`, `0007` |
| 변경 이력과 휴지통 스냅샷 | 여행 공동 편집 | 동기화된 여행 캐시에 현재 데이터 | D1 `trip_activity`, `trip_trash` | Cloudflare, 해당 여행 참여자 | 여행 삭제 시 삭제. 휴지통은 소유자가 즉시 비울 수 있음 | 기록 열람, 복원, 휴지통 비우기, 여행 삭제 | `worker.js` `activityStatements`, `trashList`; `0008`, `0009`, `0010` migrations |
| 예약 PDF·이미지 원본, 파일명·형식·크기·연결 대상 | 사용자가 파일 선택 | 원본은 IndexedDB `files` | 원본은 저장하지 않음. 파일 메타데이터만 D1 `files` | 공유자에게는 메타데이터만 보임 | 브라우저 데이터 삭제·앱의 로컬 데이터 삭제까지. 메타데이터는 여행 삭제까지 | 문서 삭제, 브라우저 데이터 삭제, 계정 삭제 시 로컬 삭제 | `sync.js` `saveBlob`, `exportBackup`; `0001_cloud_sync.sql` |
| 예약 문서 내용과 AI 추출 결과 | 사용자가 “분석” 실행 | 원본은 IndexedDB, 검토 중 결과는 메모리 | 문서 원본·추출 결과를 D1에 자동 저장하지 않음. 사용자가 적용한 필드만 여행 데이터로 D1 저장 | Cloudflare Worker, Workers AI | 요청 처리 중 사용. 플랫폼 로그·처리 위치는 운영 계약 확인 필요 | 분석 취소, 결과 미적용, 원본 삭제 | `worker.js` `analyzeDocument`; `index.html` smart import |
| 대표사진 | 사용자가 배경 선택 | 원본/로컬 사본은 IndexedDB | 1.5MB 이하 압축 공유본은 D1 `trip_hero_images` BLOB | Cloudflare, 공유 참여자 | 교체·삭제·여행 삭제까지 | 대표사진 교체·삭제, 여행 삭제 | `sync.js` `setHero`; `worker.js` `tripHero`; `0002_shared_trip_hero.sql` |
| JSON 백업 파일 | 사용자가 내보내기 실행 | 사용자가 선택한 다운로드 위치 | 서버에 백업 파일을 업로드하지 않음 | 사용자가 파일을 보관·전달한 위치 | 사용자 관리 | 파일 삭제, 새 여행으로 복원, 권한이 있는 기존 여행에 복원 | `sync.js` `exportBackup`, `previewBackup`, `importBackup` |
| 오류 진단 코드, 범주, 화면, 앱 버전, 횟수·시각 | 앱 오류 | localStorage `yeogiro-error-log`, 최대 20개 | 없음 | 사용자가 복사해 전달하기 전에는 없음 | 최대 20개, 직접 지우기 또는 로컬 데이터 삭제까지 | 앱 상태 진단 → 오류 기록 지우기 | `diagnostics.js` |
| 날씨 응답, 알림 설정·발송 이력, 설치 안내 상태, 경로 캐시 | 기능 사용 | localStorage·IndexedDB meta·Cache Storage | 일부 응답은 Cloudflare Cache | Open-Meteo, Cloudflare | 날씨 캐시는 예보 종료 시 정리, 경로 캐시 7일, 지도 캐시 최대 160개, 앱 캐시는 버전 교체 시 정리 | 브라우저 데이터 삭제, 계정 삭제 시 로컬 앱 데이터 삭제 | `index.html`, `sync.js` `routeCache*`, `sw.js` |
| IP 주소와 보안 요청 메타데이터 | API 요청 | 없음 | D1 rate-limit 키와 보안·인증 이벤트에는 SHA-256 해시만 저장. Cloudflare 플랫폼은 네트워크 요청을 처리 | Cloudflare | rate-limit은 창 종료 후 정리. 보안·인증 이벤트는 최대 180일 | 운영자 문의 | `worker.js` `rateLimited`, `securityEvent`, `authEvent`, `purgeExpired` |

## 3. JSON 백업 경계

### 포함

- 여행 기본정보, 일정, 항공편, 숙소, 경비, 공용 준비 체크리스트
- 참여자·분담 표시를 위해 여행 상태에 들어 있는 참조 정보
- 현재 기기에 실제 원본이 있는 예약 파일과 대표사진은 백업에 data URL로 포함될 수 있음
- 파일 누락·불일치 요약

### 제외

- Google `sub`, 이메일, 프로필 사진 URL
- 계정 세션 쿠키, 계정 세션 해시
- 기존 여행 접근 토큰, 초대 토큰, 긴급 복구 코드
- OAuth state, nonce, PKCE verifier
- 서버 보안 이벤트와 IP 해시
- 브라우저 알림 권한 자체, 설치 안내 상태, 오류 진단 기록

기존 여행 ID로 덮어쓸 때는 현재 계정·참여자 역할을 바꾸지 않는다. 보기 전용 사용자는 서버에 복원 내용을 저장할 수 없다. “새 여행으로 복원”은 여행과 하위 ID를 다시 만들며, 서버 최초 저장 시 현재 로그인 계정 또는 현재 기기가 소유자가 된다.

## 4. 외부 서비스 전송

| 제공자 | 트리거 | 여기로가 보내는 값 | 여기로가 받는 값 | 브라우저가 직접 접속하는가 | 제공자 정책 |
|---|---|---|---|---|---|
| Google OAuth | Google 로그인 선택 | OAuth 요청, PKCE challenge, state, nonce, 앱 redirect URI | ID token의 `sub`, 이름, 이메일, 사진 URL, 이메일 확인 | Google 로그인 페이지로 이동 | https://policies.google.com/privacy?hl=ko |
| Cloudflare Workers·D1·Static Assets | 앱 접속·동기화 | 요청 IP/헤더, 계정·여행 데이터, 압축 대표사진 | 앱·API 응답 | 예 | https://www.cloudflare.com/privacypolicy/ |
| Cloudflare Workers AI | 예약 문서 분석 선택 | PDF/JPG/PNG/WEBP 원본(최대 8MB)과 추출 프롬프트 | 구조화 후보값 | Worker를 통해 처리 | `[[Workers AI 데이터 처리 위치·학습 사용 여부·로그 보존을 운영 계정/계약에서 확인 필요]]` |
| Open-Meteo | 날씨 조회 | 도시명 또는 위·경도 | 지오코딩·예보 | Worker를 통해 처리 | https://open-meteo.com/en/terms |
| OSMF Nominatim | 장소 좌표 자동 보완 | 사용자가 입력한 장소 문자열, 브라우저 네트워크 정보 | 좌표 | 예, 브라우저에서 직접 요청 | https://osmfoundation.org/wiki/Privacy_Policy |
| OSMF tile.openstreetmap.org | 지도 표시 및 프록시 실패 시 대체 | 지도 타일 좌표, 브라우저 네트워크 정보 | 지도 타일 | 통상 Worker 프록시, 실패 시 브라우저 직접 요청 가능 | https://osmfoundation.org/wiki/Privacy_Policy |
| routing.openstreetmap.de / router.project-osrm.org | 이동 경로 조회 | 출발·도착 좌표, 이동수단, Worker 네트워크 정보 | 경로·거리·시간 | Worker를 통해 처리 | `[[각 라우팅 운영자의 최신 개인정보 정책·처리 위치 확인 필요]]` |
| Frankfurter | 환율 조회 1차 | 기준/대상 통화 코드 | 기준 환율 | Worker를 통해 처리 | https://frankfurter.dev/ |
| ExchangeRate-API (`open.er-api.com`) | Frankfurter 실패 시 환율 조회 | 기준 통화 코드 | 대체 환율 | Worker를 통해 처리 | https://www.exchangerate-api.com/terms |
| Google Maps | 사용자가 지도/길찾기 버튼 선택 | 장소 검색어 또는 좌표, 이동수단, 브라우저 네트워크 정보 | 외부 지도 화면 | 예, 새 화면으로 이동 | https://policies.google.com/privacy?hl=ko |

여기로는 위 외부 제공자에게 계정 이메일, 예약번호, 전체 일정 또는 예약 문서 원본을 보내지 않는다. 단, Workers AI 문서 분석만 사용자가 선택한 원본 문서를 처리한다.

## 5. 계정·공유·삭제 상태 전이

- 로그아웃: 해당 계정 로그인 세션만 해지한다. 오프라인 여행 캐시와 원본 파일은 기기에 남는다.
- 기기별 로그아웃: 선택한 `auth_sessions`만 해지한다. 다른 기기와 여행 데이터는 유지한다.
- 여행 나가기: 해당 참여자 권한과 기존 여행 세션을 해지한다. 공유 여행 자체는 남는다.
- 여행 삭제: 소유자만 가능하며 D1의 여행 및 종속 데이터를 삭제한다. 다른 참여자도 접근할 수 없게 된다.
- 계정 삭제: 소유한 여행이 있으면 차단한다. 소유권 이전 또는 여행 삭제 후 진행한다. 비소유 공유 여행은 남기고 탈퇴자의 표시명을 익명화하며 참여 권한·세션·Google 연결·계정 개인정보를 삭제한다. 클라이언트가 성공 응답을 받으면 IndexedDB와 `yeogiro-*` 웹 저장소를 비운다.
- 사용자가 이미 내려받은 JSON 파일, 다른 사람이 별도로 보관한 사본, 외부 제공자의 법정·보안 보존분은 앱의 계정 삭제로 직접 지울 수 없다.

## 6. 위험 검토와 조치

| 위험 | 감사 결과 | 조치 |
|---|---|---|
| 원문 IP를 D1 rate-limit 키에 저장 | 기존 코드에서 확인 | 키 생성 전에 SHA-256 해시하도록 수정 |
| 원본 오류 객체가 Worker 로그로 유출 | 기존 `console.error(error)` 가능성 확인 | 오류 이름·160자 메시지만 기록하도록 제한 |
| OAuth 토큰 장기 저장 | 저장하지 않음 | Google ID token은 검증에만 사용하고 자체 세션 토큰 해시만 저장 |
| OAuth CSRF/재전송 | state 원문 쿠키와 DB 해시, nonce, PKCE, 10분 만료, 1회 소비 | 구현 및 회귀 테스트 대상 |
| 로그인 전 기존 여행 자동 귀속 | 강제 자동 귀속하지 않음 | 로그인 후 유효한 기존 Bearer 세션을 다시 검증하고 사용자 버튼으로 claim |
| 계정 삭제가 공유 여행을 파괴 | 소유 여행이 있으면 계정 삭제 차단 | 소유권 이전/여행 삭제를 선행. 비소유 회원은 익명화 후 해지 |
| 예약 원본을 서버에 상시 보관 | D1에는 메타데이터만, 원본은 IndexedDB | UI와 방침에 명시. AI 분석 요청 때만 일시 전송 |
| 공개 지도/지오코딩 서비스로 장소·좌표 전송 | 확인됨 | 방침에 트리거와 항목 명시. 민감 장소 입력 주의 안내 필요 |
| 정리되지 않는 보안 이벤트·해지 세션 | 기존 무기한 상태 확인 | 일일 scheduled cleanup과 30일/180일 상한 추가 |
| 소프트 삭제된 여행의 무기한 잔존 | 기존 구현 확인 | 향후 여행 삭제를 D1 cascade 물리 삭제로 변경. `[[기존 soft-delete 행의 운영 DB 잔존 여부 점검 필요]]` |
| 외부 처리 위치·국외 이전 고지 불완전 | 운영 계약·배포 리전 정보가 저장소에 없음 | 공개 전 운영자가 placeholder를 채우고 법률 검토 |

## 7. 미확정 운영정보

다음은 코드만으로 확정할 수 없어 문서에 placeholder로 남긴다.

1. `[[운영자 실명 또는 법인명]]`, 주소, 대표자
2. 개인정보 보호 문의 이메일·전화번호
3. 적용 법률, 준거법, 관할 법원, 서비스 대상 지역과 최소 연령
4. Cloudflare 고객 계약상 처리 법인, 실제 D1/Workers AI 처리 위치, 국외 이전 국가·시점·방법·보호조치
5. Google OAuth 처리 법인과 대한민국 이용자에 대한 국외 이전 고지 세부
6. routing.openstreetmap.de 및 router.project-osrm.org 운영자·처리 위치·로그 보유기간
7. 기존 soft-delete 여행 행 수와 삭제 계획
8. 법령상 별도 보존해야 하는 기록 유무

## 8. 향후 privacy check 대조점

정책 변경 때 아래 매핑을 기계적으로 대조한다.

- 데이터 필드: `migrations/*.sql`, `validateTrip`, `authMe`, `loadTrip`, `exportBackup`
- 수집 트리거: `googleStart`, `googleCallback`, `analyzeDocument`, `weatherForecast`, `routeForecast`, `exchangeRate`, `geocode`, `navUrl`
- 저장 위치: IndexedDB object store 목록, localStorage 키 prefix, D1 table 목록, Cache Storage 이름
- 공유 범위: `memberFor`, `canEdit`, invite/claim/recovery/account deletion endpoints
- 보유기간: `AUTH_MAX_AGE`, OAuth 만료, invite/device-code 만료, `purgeExpired`, Service Worker cache version
- 동의 UI: `googleLoginSheet`, 내 정보 로그인 카드, `POLICY_VERSION`
- 공개 링크: `/privacy`, `/terms`, 설정 메뉴, 로그인 고지, Service Worker `APP_SHELL`
- 부재 확인: analytics/ad/marketing/payment SDK 검색

정책 문구와 코드 중 하나가 바뀌면 이 표, `PRIVACY.md`, `TERMS.md`, 공개 HTML, 정책 버전을 같은 변경에서 갱신한다.
