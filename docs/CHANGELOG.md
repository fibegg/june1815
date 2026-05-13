# Changelog

All notable user-visible changes are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial implementation. CLI (`gogogo`, `doctor`, `config`),
  PTY-driven Claude TUI wrapper with `@xterm/headless` parsing,
  HTTP REST + SSE app-server (Hono), conversation manager with
  per-conversation `claude` child processes, session marker
  persistence, configurable via CLI / ENV / yaml / defaults.
- Architecture Decision Records 0001–0009.
- Runnable Alloy 6 spec suites for session lifecycle, message queue,
  auth/config priority, and HTTP API contract.
- Multi-stage multi-arch Dockerfile + docker-compose for prod and dev.
- GitHub Actions workflows: CI (test, lint, typecheck, Alloy,
  coverage), Docker build/push to GHCR, npm release on tag with
  Slack notifications.
- Bearer-everywhere middleware: token accepted via header, query
  param, or auto-planted HttpOnly cookie so a browser SPA loaded with
  `?token=...` can fetch static assets without further wiring
  (ADR-0010).
- Image and file attachments on `/messages` and `/queue` as base64
  data URLs; written to per-conversation upload dirs and exposed to
  `claude` via `--add-dir` (ADR-0012).
- Optional React + Tailwind + shadcn-style chat UI mounted at `/`
  when `JUNE15_UI_ENABLED=1`. Lives as a separate npm workspace under
  `ui/` so the runtime npm package stays small for headless consumers
  (ADR-0011).
- End-to-end test suite under `tests/e2e/` that spawns the built CLI,
  exercises the full API (create, stream, queue, steer, interrupt,
  delete, attachments), and skips cleanly when `claude` is not
  available locally.
