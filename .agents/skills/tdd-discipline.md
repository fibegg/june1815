# TDD discipline

## When to use

Library-shaped code with clear inputs and outputs. june1815's pure modules
(config loader, parsers, queue, terminal adapter) benefit hugely; the
integration assembly in `cli/commands/gogogo.ts` benefits less but is
still factored so the *composition* (`composeGogogo`) is testable
without binding a socket.

## Rules we follow

- **Tests first**, locally. Write the failing test, watch it fail, make
  it pass.
- **Atomic commits**: each `feat:` commit lands tests + the minimal
  implementation that makes them pass. The repo is never broken on a
  commit, but the discipline of writing tests first is preserved by
  local workflow.
- **Coverage thresholds enforced**: vitest config sets
  `thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 }`.
  CI fails below.
- **Injectable boundaries**: every external dependency (fs, env,
  spawn, timers, prompts) is parameterized so tests don't touch the
  real thing. Production code provides a default implementation.

## What we don't do

- Don't mock what we own. Use the real `TerminalAdapter` in
  conversation tests; mock only the `ClaudePty` (because the real one
  loads node-pty).
- Don't test via reflection of private members. Export `__test`
  helpers when needed (see `src/pty/tui-parser.ts`, `src/cli/commands/config.ts`).
- Don't test logging output unless it's a public contract. We treat
  the logger as a fire-and-forget sink.

## Where it shows up in june1815

- Every `src/x/y.ts` has a `tests/unit/x/y.test.ts` peer.
- `tests/integration/` is reserved for tests that spin up a real
  `claude` process (skip-gated when the binary is absent).
- `tests/fixtures/tui-recordings/` — captured raw ANSI streams used to
  replay through `TuiParser` deterministically (added as we collect
  recordings from real sessions).
