# 여기로

**배포 주소:** https://yeogiro.puleun58.workers.dev

여러 여행의 일정, 항공편, 예약 서류와 이동 경로를 관리하는 모바일 우선 여행 플래너입니다.

## 주요 기능

- 여행·일정·항공편·숙소 정보를 Cloudflare D1에 동기화
- 소유자·편집자·보기 전용 권한과 1회용·다회용 초대 링크를 지원하는 여행 공유
- 참여자 표시명, 마지막 접속, 기기별 세션, 소유권 복구키와 소유권 이전 관리
- IndexedDB 오프라인 캐시와 네트워크 복구 후 변경사항 동기화
- PDF·이미지 예약 문서 AI 자동 입력과 기기 내 예약 서류 보관
- 오늘 일정 요약, 이동 예상시간·충돌 경고, 이동수단별 지도 경로
- 알람, 안정화된 ICS 캘린더, JSON v2 백업·복원, 설치형 PWA
- 오프라인 앱 셸과 최근 지도 타일 캐시

## PWA

설정의 `앱으로 설치`에서 플랫폼에 맞는 설치 흐름을 제공합니다.

- Android Chrome·Samsung Internet: 설치 가능한 상태이면 시스템 앱 설치창을 실행합니다.
- iPhone·iPad Safari: Safari 공유 아이콘을 누르고 `홈 화면에 추가` → `웹 앱으로 열기` → `추가` 순서로 설치합니다.
- 카카오톡 등 iOS 인앱 브라우저: `Safari로 열기`를 먼저 선택합니다. 메뉴가 없을 때는 앱에서 주소를 복사해 Safari로 열 수 있습니다.
- 이미 설치된 앱에서는 중복 설치 안내를 표시하지 않습니다.

iOS Safari의 `홈 화면에 추가` 메뉴는 웹페이지에서 강제로 열 수 없으므로 앱 안에서 실제 공유 아이콘 위치와 설치 순서를 안내합니다. 자세한 절차는 [Apple의 iPhone 웹 앱 설치 안내](https://support.apple.com/guide/iphone/iphea86e5236/ios)를 참고하세요.

최근 여행 데이터는 IndexedDB에 캐시되어 오프라인에서도 열 수 있고, 오프라인 변경사항은 연결이 복구되면 D1과 동기화됩니다. 지도, 경로 검색과 예약 문서 AI 분석은 네트워크 연결이 필요합니다.

여행 저장은 revision 갱신과 하위 데이터를 하나의 D1 배치로 처리합니다. 다른 기기와 수정이 겹치면 서버 최신 내용 또는 이 기기의 변경사항 중 유지할 내용을 직접 선택하며, 선택 전에는 어느 쪽도 자동으로 덮어쓰지 않습니다. 상단 상태 표시를 누르면 마지막 동기화 시각과 대기 건수, 오프라인 보관 상태를 확인할 수 있습니다.

참여자와 권한은 `members`, 기기별 접근 토큰은 `sessions`에 분리해 저장합니다. 소유권 복구키 원문은 생성 시 한 번만 표시하고 서버에는 SHA-256 해시만 저장합니다. 복구키를 재발급해도 기존 기기 세션은 유지되며, 특정 기기 연결 해제는 해당 세션만 무효화합니다.

PDF와 예약서류 이미지는 비용이 발생할 수 있는 공용 객체 저장소를 사용하지 않고 각 기기의 IndexedDB에만 저장합니다. 공유 여행에서는 파일명과 연결 정보가 보이지만 원본 파일은 저장한 기기에서만 열 수 있습니다. 여행 대표사진은 모바일에서 압축한 한 장만 권한이 보호된 D1 저장소로 동기화되어 동행자도 같은 배경을 볼 수 있습니다. 기존 `localStorage` 데이터는 최초 실행 시 D1·IndexedDB 구조로 자동 이전하며 안전을 위해 원본을 즉시 삭제하지 않습니다.

## 기술 구성

- 순수 HTML, CSS, JavaScript
- Cloudflare Workers, D1, Workers AI, Static Assets
- IndexedDB 오프라인 캐시·파일 저장
- Wrangler

## 서체

앱에는 LY Corp.의 `LINE Seed KR` Regular·Bold 웹폰트를 자체 포함합니다. 폰트는 SIL Open Font License 1.1로 제공되며 라이선스 전문은 `assets/fonts/OFL-LINE-Seed.txt`에 있습니다.

## 로컬 실행

```bash
npm install
npx wrangler d1 migrations apply yeogiro-db --local
npx wrangler dev --local
```

핵심 권한·초대·충돌·문서 검증 API 통합 테스트는 로컬 D1과 Worker를 사용합니다.

```bash
npm test
```

배포 후 운영 Worker의 여행 생성, 1회용 초대, revision 충돌과 정리까지 확인하려면 다음 명령을 실행합니다. 검증용 여행은 테스트 종료 시 삭제합니다.

```bash
npm run test:production-smoke
```

## 운영 검증 범위

`npm test`는 다음 시나리오를 로컬 D1과 실제 Worker 런타임에서 검증합니다.

- owner / editor / viewer 권한과 관리 API 차단
- 1회용·다회용 초대, 만료, 사용 횟수와 취소
- 표시명 변경과 참여자 목록 반영
- 참여자 권한 변경·제거와 마지막 소유자 보호
- 소유권 복구키 생성·재발급·오입력 거부·새 기기 복구
- 기기별 세션 발급·이름 변경·연결 해제와 해제 토큰 401
- 소유권 이전 후 기존 소유자의 편집 가능 전환
- optimistic revision 409와 두 충돌 선택 문구
- 일정·항공편·숙소·예약 서류, 휴지통, IndexedDB, PWA 캐시, JSON 백업·복원

## 현재 제한사항

- 계정 로그인 없이 여행별 토큰과 복구키를 사용하므로 복구키 분실 시 접근 가능한 소유자 기기에서만 재발급할 수 있습니다.
- 플랫폼과 앱/브라우저 유형만 표시하며 정확한 휴대폰 모델은 추측하지 않습니다.
- 예약 서류 원본은 기기별 IndexedDB에 저장되어 다른 기기에는 자동 복제되지 않습니다.
- 브라우저 자동화만으로 iOS 홈 화면 설치와 운영체제 공유창 전체를 재현할 수 없어 실제 iPhone PWA에서 릴리스 전 수동 확인이 필요합니다.

## 배포

```bash
npm install
npx wrangler d1 migrations apply yeogiro-db --remote
npm run deploy
```

배포 설정에는 D1 `DB`, Workers AI `AI`, Static Assets `ASSETS` 바인딩이 필요합니다. R2는 활성화하지 않으며 PDF와 예약서류 이미지는 각 기기의 IndexedDB에 저장합니다. 공유용 여행 대표사진만 1.5MB 이하로 압축해 D1에 저장합니다.
