---
summary: "Refactor guide: unify CLI + daemon override parsing."
---

# Refactor: Config Overrides Unification

Goal: single override parser for CLI + daemon.

## Steps
- [ ] Inventory override paths.
  - Files: `src/run/run-settings.ts`, `src/daemon/request-settings.ts`.
- [ ] Define shared override input type.
  - Flags + raw request fields + config defaults.
- [ ] Create shared resolver.
  - New `resolveRunOverrides()` signature to cover both paths.
- [ ] Migrate daemon.
  - Remove duplicate parsing in `request-settings`.
- [ ] Migrate CLI.
  - Ensure identical precedence.
- [ ] Add precedence tests.
  - Flag vs config vs request.
- [ ] Verify behavior in smoke tests.

## Done When
- No duplicate override parsing.
- Tests cover precedence and defaults.

## Tests
- `pnpm -s test tests/daemon.request-settings.test.ts tests/cli.run.arg-branches.test.ts`
