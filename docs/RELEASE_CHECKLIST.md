# Release Checklist

## Automated gate

- `npm test`: syntax, unit/static, Worker+D1 integration, two-device browser E2E
- `npm run build`: production assets
- `npm run deploy`: runs the full test gate and build before Wrangler deploy
- `npm run test:production-smoke`: production trip, invite, conflict, and cleanup smoke test
- `node tests/e2e/full-journey.e2e.mjs`: 여행 생성 → 일정·항공·숙소 → 여행 준비 → D-Day 전환 → 여행 기록 → 경비 → 검색 → 백업·복원 → 오프라인 → 중복 요청 → 데이터량 기준선

The browser E2E creates isolated owner/editor contexts and verifies both conflict choices, monotonic revisions, no duplicate records, IndexedDB outbox persistence across reload, reconnect sync, and offline trip search.

## v1.0.0 결과 (2026-09-05 배포, main 4a093e8 / build `v1.0.0 · 4a093e8`)

| 항목 | 상태 |
| --- | --- |
| `npm test` (check·unit/static·API 통합·2기기 E2E·전체 여정 E2E) | PASS |
| `npm run build` | PASS |
| `npm run deploy` (배포 전 전체 게이트 재실행) | PASS |
| `npm run test:production-smoke` | PASS |
| D1 migration 0001~0012 운영 적용 | PASS |
| D1 migration 0013 (좌표 0,0 정리) | PASS (운영 적용, 일정 4건 복구) |
| 신규 D1에 0001~0013 순차 적용 | PASS |
| 기존 D1 업그레이드(0003 이후 → 0013) 데이터 보존 | PASS |
| 운영 자산 일치(index/js/manifest/sw/icons/fonts) | PASS (17개 파일 해시 일치) |
| 앱 버전 주입(`v1.0.0 · <commit>`) | PASS |
| `GET /api/health` D1 연결 | PASS |
| 기존 사용자 PWA 업그레이드(v76 → v77) | PASS (오래된 셸·타일 캐시 정리, reload loop 없음) |
| 오프라인 셸·재연결 | PASS |
| 권한(owner/editor/viewer)·초대·세션·복구·소유권 이전 | PASS (API 통합·운영 smoke) |
| 충돌 두 선택(keep-remote / keep-local) | PASS |
| 여행 준비 홈·시트 수치 일치 | PASS (전체 여정 E2E) |
| Adaptive home 상태 전환(D-7·D-1·오늘 출발·여행 중·여행 종료) | PASS (전체 여정 E2E) |
| 여행 종료 후 `여행 기록 보기` | PASS (P1 수정 후 재검증) |
| 앱 상태 진단(버전·동기화·SW·IndexedDB·API·오류) | PASS (운영 브라우저 검증) |
| 홈 화면 추가 안내(Safari·iOS Chrome·Android Chrome·standalone·다시 보지 않기·재노출) | PASS (로컬 브라우저 검증) |
| 정상 사용 흐름 console error·4xx/5xx | PASS (0건) |
| iPhone·standalone PWA 실기기 | MANUAL CHECK |
| AI 예약서류 실파일 3종 | MANUAL CHECK |
| iOS 시스템 공유 시트 | MANUAL CHECK |
| 실기기 software keyboard·safe area·landscape | MANUAL CHECK |

## Before deployment

- Confirm all remote D1 migrations are applied in order; never edit an applied migration.
- Confirm an existing trip loads and a new trip can be created.
- Confirm owner/editor/viewer API permissions, single-use and multi-use invites, recovery keys, session revocation, ownership transfer, trash restore, and JSON backup tests pass.
- Review normal browser use for console errors and unhandled rejections.

## Manual iPhone and PWA checks

- Install from Safari and launch in standalone mode.
- Check top and bottom safe areas in portrait and landscape.
- Open every bottom sheet and confirm background scrolling is locked.
- Open forms with the software keyboard; verify date/time fields and bottom actions remain reachable.
- Verify long Korean participant, airport, lodging, and reservation names wrap naturally.
- Verify the iOS system share sheet for invitation links.
- Verify home-screen icon and splash presentation.
- Upgrade from the previously deployed PWA and confirm the new shell loads once, stale caches are removed, and no reload loop occurs.
- Toggle a real network connection while an edit is pending; confirm the queued edit returns after relaunch and syncs once.

## Manual AI document checks

- Use one clear flight ticket, one hotel voucher, and one incomplete or blurry document.
- Confirm extracted values remain editable and are never saved before confirmation.
- Confirm low-confidence or absent fields are marked for review rather than guessed.
- Confirm reanalysis shows meaningful field changes and does not overwrite automatically.
- Confirm local-only originals show metadata on another device without offering an invalid file open action.

