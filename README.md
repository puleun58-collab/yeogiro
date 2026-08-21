# 여기로

**배포 주소:** https://yeogiro.puleun58.workers.dev

여러 여행의 일정, 항공편, 예약 서류와 이동 경로를 관리하는 모바일 우선 여행 플래너입니다.

## 주요 기능

- 여행별 일정·항공편 관리 및 `localStorage` 저장
- OpenStreetMap 지도와 OSRM 이동 경로
- PDF·이미지 예약 문서 AI 자동 입력
- 예약 서류 보관, 알람, ICS 캘린더 내보내기
- JSON 백업·복원 및 홈 화면 추가 지원

## 기술 구성

- 순수 HTML, CSS, JavaScript
- Cloudflare Workers, Workers AI, Static Assets
- Wrangler

## 로컬 실행

`index.html`을 브라우저에서 열거나 정적 파일 서버로 실행합니다.

## 배포

```bash
npm install
npm run deploy
```
