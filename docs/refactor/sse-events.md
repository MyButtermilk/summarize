---
summary: "Refactor guide: typed SSE events shared by daemon + extension."
---

# Refactor: SSE Event Typing

Goal: single event schema + encoder/decoder shared by daemon + extension.

## Steps
- [x] Inventory current event shapes and emitters.
  - Files: `src/daemon/server.ts`, `src/daemon/summarize.ts`, `apps/chrome-extension/src/entrypoints/sidepanel/stream-controller.ts`.
- [x] Define `SseEvent` union + payload types in shared module.
  - New file: `src/shared/sse-events.ts` (or `src/shared/contracts.ts` if appropriate).
- [x] Implement encode/decode helpers.
  - `encodeSseEvent(event): string`
  - `parseSseEvent(raw): SseEvent`
- [x] Update daemon emit path to use encoder.
  - Replace inline string building with `encodeSseEvent`.
- [x] Update extension parse path to use decoder.
  - Replace `JSON.parse(msg.data)` switches with `parseSseEvent`.
- [x] Add focused tests.
  - Round‑trip encoding.
  - Optional fields (meta, metrics).
- [x] Verify behavior parity.
  - Compare event stream before/after in dev logs.

## Done When
- One source of truth for event types.
- No stringly‑typed event handling in UI.

## Tests
- `pnpm -s test tests/chrome.* tests/daemon.*`
