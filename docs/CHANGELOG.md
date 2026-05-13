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
