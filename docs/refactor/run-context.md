---
summary: "Refactor guide: shared run context factory for CLI + daemon."
---

# Refactor: Run Context Builders

Goal: single factory for run context (env, config, flags, metrics).

## Steps
- [ ] Inventory duplicated setup.
  - Files: `src/run/runner.ts`, `src/daemon/flow-context.ts`.
- [ ] Define `RunContext` type.
  - Includes env, config, model selection, metrics hooks, overrides.
- [ ] Create factory function.
  - New file: `src/run/run-context.ts`.
  - Inputs: base env, overrides, output sinks.
- [ ] Migrate CLI to factory.
  - Replace inline assembly in `runCli`.
- [ ] Migrate daemon to factory.
  - Replace `createDaemonUrlFlowContext` setup pieces.
- [ ] Align defaults and precedence.
  - Confirm behavior matches existing tests.
- [ ] Add tests for context output.
  - Small unit tests for precedence and fields.

## Done When
- CLI + daemon share one builder.
- No duplicated default logic.

## Tests
- `pnpm -s test tests/cli.* tests/daemon.run-context-overrides.test.ts`
