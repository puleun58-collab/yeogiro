# 여기로

**배포 주소:** https://yeogiro.puleun58.workers.dev

여러 여행의 일정, 항공편, 예약 서류와 이동 경로를 관리하는 모바일 우선 여행 플래너입니다.

## 주요 기능

- 여행별 일정·항공편 관리 및 `localStorage` 저장
- OpenStreetMap 지도와 OSRM 이동 경로
- PDF·이미지 예약 문서 AI 자동 입력
- 예약 서류 보관, 알람, ICS 캘린더 내보내기
- JSON 백업·복원 및 설치형 PWA 지원
- 오프라인 앱 셸과 최근 지도 타일 캐시

## PWA

지원 브라우저에서는 상단의 `앱 설치` 버튼으로 설치할 수 있습니다. 저장한 여행 데이터는 기기의 `localStorage`에 유지되며, 오프라인에서도 앱과 기존 일정을 열 수 있습니다. 지도, 경로 검색과 예약 문서 AI 분석은 네트워크 연결이 필요합니다.

## 기술 구성

- 순수 HTML, CSS, JavaScript
- Cloudflare Workers, Workers AI, Static Assets
- Wrangler

## 서체

앱에는 LY Corp.의 `LINE Seed KR` Regular·Bold 웹폰트를 자체 포함합니다. 폰트는 SIL Open Font License 1.1로 제공되며 라이선스 전문은 `assets/fonts/OFL-LINE-Seed.txt`에 있습니다.

## 로컬 실행

`index.html`을 브라우저에서 열거나 정적 파일 서버로 실행합니다.

## 배포

```bash
npm install
npm run deploy
```
