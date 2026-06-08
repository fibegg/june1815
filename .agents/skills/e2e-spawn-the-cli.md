# E2E tests that spawn the CLI

## When to use

Anywhere the unit tests can't credibly cover the wire contract:
process bootstrap, HTTP routing layered through middleware, streaming
SSE, and especially anything that depends on a real external child
(claude, in our case). Run them only when the prerequisites are
present; skip cleanly otherwise.

## Architecture

- A **separate vitest config** (`vitest.e2e.config.ts`) with longer
  timeouts, `singleFork: true` (tests share a port), and coverage
  disabled. Add a `test:e2e` script.
- A **preflight** module that probes the binary + auth and returns
  `{ ok: false, reason }` when prerequisites are missing. The test file
  reads the result once at module load and uses `describe.skipIf` to
  skip the whole suite — no tests are "marked TODO", they truly skip.
- A **spawnGogogo()** helper that runs `node dist/cli/bin.js gogogo
  --headless --port 0 --data-dir <mkdtempSync>`, parses the first JSON
  line of stdout for `{url, token}`, and returns a handle with a `stop()`
  that kills the child and cleans up the data dir.
- An **SSE reader** (async generator over `response.body.getReader()`)
  so tests can `for await (const frame of readSse(res))` and break out
  on the first `done` or `error` event.

## Why this pattern works

- The data dir is unique per run, so tests don't leak conversations
  into each other.
- The CLI prints a JSON line on stdout in headless mode; that's the
  contract the e2e suite relies on. It's tested elsewhere too, so if
  someone breaks the boot line, the unit tests catch it before the
  e2e suite gets a chance.
- `--port 0` asks the OS for an ephemeral port; the CLI prints the
  actual port back. No port-conflict flakes.
- The skip predicate is itself unit-tested (`tests/unit/e2e-preflight`)
  so the "skip cleanly" promise can't bit-rot silently.

## Where it shows up in june1815

- `vitest.e2e.config.ts`
- `tests/e2e/helpers/preflight.ts` (claude binary + auth source check)
- `tests/e2e/helpers/spawn-server.ts` (`spawnGogogo`)
- `tests/e2e/helpers/sse-client.ts` (async-generator SSE reader)
- `tests/e2e/api.test.ts` (the full lifecycle drive)
- `tests/unit/e2e-preflight.test.ts` (locks the skip predicate)

## CI lane

Default: e2e runs alongside unit tests and gracefully skips when
claude isn't available. To make CI hard-fail on missing prerequisites
(e.g. a release lane that requires a secret), set
`JUNE1815_E2E_FORCE=1` (placeholder env to read inside `checkPreflight`
when you wire that lane).
