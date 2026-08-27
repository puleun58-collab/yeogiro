# Release Checklist

## Automated gate

- `npm test`: syntax, unit/static, Worker+D1 integration, two-device browser E2E
- `npm run build`: production assets
- `npm run deploy`: runs the full test gate and build before Wrangler deploy
- `npm run test:production-smoke`: production trip, invite, conflict, and cleanup smoke test

The browser E2E creates isolated owner/editor contexts and verifies both conflict choices, monotonic revisions, no duplicate records, IndexedDB outbox persistence across reload, reconnect sync, and offline trip search.

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

