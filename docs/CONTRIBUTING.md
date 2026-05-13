# Contributing

Welcome. june15 is small, opinionated, and aims to stay that way. Before
opening a PR:

1. Run the full check loop locally:

   ```sh
   nvm use && npm ci
   npm run ci   # lint + typecheck + test:coverage + build
   ```

2. If your change touches a state machine, queue, auth/config priority,
   or HTTP API event sequence, update the relevant Alloy spec under
   `docs/alloy/` and run:

   ```sh
   scripts/run-alloy.sh
   ```

3. If your change is more than a typo or a localized fix, add or update
   an ADR under `docs/adr/` and link it from `docs/adr/README.md`.

4. Follow Conventional Commits. Each commit should be small enough to
   describe in one sentence. Co-author trailers are welcome but not
   required.

## Architecture refresher

Read [docs/design/architecture.md](./design/architecture.md) first. The
package is organized by layer (`config`, `claude`, `pty`, `conversation`,
`server`, `cli`) — touch the narrowest one that solves the problem.

## Testing philosophy

- Pure modules get fast unit tests (Vitest, no live processes).
- Integration tests under `tests/integration/` spawn a real `claude`
  binary; they auto-skip when the binary is absent.
- TUI parser changes should ship with a recording under
  `tests/fixtures/tui-recordings/` so the regression is locked in.

## Security

See [`SECURITY.md`](./SECURITY.md). Please do not file public issues for
security bugs.
