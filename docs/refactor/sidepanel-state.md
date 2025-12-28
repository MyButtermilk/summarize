---
summary: "Refactor guide: explicit side panel UI state machine."
---

# Refactor: Side Panel State Machine

Goal: explicit state machine for side panel UI (idle/connecting/streaming/error).

## Steps
- [ ] Inventory current state flags.
  - Files: `apps/chrome-extension/src/entrypoints/sidepanel/main.ts`, `.../types.ts`.
- [ ] Define `PanelState` union.
  - `idle | setup | connecting | streaming | error`.
- [ ] Create reducer or state transition helpers.
  - Pure functions with explicit transitions.
- [ ] Replace ad‑hoc booleans.
  - Wire UI to `PanelState` changes only.
- [ ] Update stream controller callbacks.
  - Emit explicit transitions.
- [ ] Add unit tests.
  - Validate transitions for errors + aborts.
- [ ] Verify UI behavior.
  - Manual: connect, stream, error, recover.

## Done When
- Single source of truth for UI state.
- No direct DOM updates outside state transitions.

## Tests
- `pnpm -s test tests/chrome.*`
