# 여기로

**배포 주소:** https://yeogiro.puleun58.workers.dev

여러 여행의 일정, 항공편, 예약 서류와 이동 경로를 관리하는 모바일 우선 여행 플래너입니다.

## 주요 기능

- 여행·일정·항공편·숙소 정보를 Cloudflare D1에 동기화
- 소유자·편집자·보기 전용 권한을 지원하는 여행 공유 링크
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

## 배포

```bash
npm install
npx wrangler d1 migrations apply yeogiro-db --remote
npm run deploy
```

배포 설정에는 D1 `DB`, Workers AI `AI`, Static Assets `ASSETS` 바인딩이 필요합니다. R2는 활성화하지 않으며 PDF와 예약서류 이미지는 각 기기의 IndexedDB에 저장합니다. 공유용 여행 대표사진만 1.5MB 이하로 압축해 D1에 저장합니다.
