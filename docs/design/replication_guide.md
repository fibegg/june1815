# Replication guide

How to rebuild june1815 from scratch, in order. Pair with the focused notes
in [`.agents/skills/`](../../.agents/skills/) — each skill below points to
the one that documents *how* we adopted it.

## 1. Scaffolding

Create the repo. Tools and configs to commit before any code:

- `package.json` with `"type": "module"`, strict TS deps, an `exports` map
  exposing only what you intend to publish, and a `files` allowlist that
  keeps the npm tarball lean. See `.agents/skills/esm-only-packaging.md`.
- `tsconfig.json` with every strict flag, plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, and `verbatimModuleSyntax`. See
  `.agents/skills/typescript-strict.md`.
- `tsup.config.ts` (ESM-only bundle, `dts: true`).
- `vitest.config.ts` with coverage thresholds enforced. See
  `.agents/skills/tdd-discipline.md`.
- ESLint flat config + Prettier.
- `.editorconfig`, `.gitignore`, `.nvmrc`, `.npmrc`, `LICENSE`.

## 2. Specs first

Before any production code, write the contracts:

- ADRs under `docs/adr/`. Even retrospective ADRs help future contributors;
  decide once, link forever.
- Alloy 6 spec suites under `docs/alloy/`. Four areas (session lifecycle,
  message queue, auth+config priority, HTTP API contract). See
  `.agents/skills/alloy-as-living-spec.md`.

## 3. Config layer

- `src/config/schema.ts` — single zod schema for every leaf with defaults.
- `src/config/env-keys.ts` — catalogue mapping each ENV var to a YAML path,
  type, description, and `secret` flag.
- `src/config/loader.ts` — pure function `(cli, env, fs, paths) -> Config`
  with deterministic precedence. See `.agents/skills/zod-to-env-example.md`.
- `scripts/gen-env-example.ts` renders `.env.example` from `env-keys.ts`.
- `src/logger.ts` — pino with mode-aware presets.

## 4. Binary handling

- `locator.ts` — PATH-enriched search, nvm-aware, platform-aware.
- `installer.ts` — consent-gated install. Headless without `auto-install`
  refuses.
- `version.ts` — `claude --version` parser tolerant of ANSI.
- `auth-detector.ts` — env precedence first, then files.

## 5. PTY layer

- `claude-pty.ts` — node-pty wrapper exposing typed lifecycle events.
- `terminal.ts` — `@xterm/headless` adapter with promise-returning write
  and snapshot API.
- `ansi.ts` — strip + region helpers.
- `tui-parser.ts` — pattern-driven parser, emits typed events.
- `input-driver.ts` — keystroke driver (text, interrupt, steer).

See `.agents/skills/pty-screen-scraping.md`.

## 6. Conversation layer

- `queue.ts` — FIFO with in-flight slot (mirrors `message_queue.als`).
- `conversation.ts` — wires PTY + terminal + parser + driver + queue.
- `session-marker.ts` — `<dataDir>/conversations/<id>/session.txt`.
- `manager.ts` — Map<id, Conversation>, bounded by `maxConversations`.
- `factory.ts` — production wiring of all the above.

## 7. HTTP server

- `events.ts` — zod event schemas (publishes as the `june1815/events`
  subpath).
- `sse.ts` — SSE framing helper.
- middleware: `request-id`, `bearer-auth`, `error`.
- routes: `health`, `auth`, `conversations`, `messages`.
- `server.ts` — Hono app factory wiring middleware. See
  `.agents/skills/sse-streaming.md`.

## 8. CLI

- `cli.ts` — commander wiring, June1815Error → exit-code mapping.
- `commands/gogogo.ts` — composes everything; pure `composeGogogo()` step
  for testing.
- `commands/doctor.ts` — checks PATH, claude, auth, geometry, bind.
- `commands/config.ts` — `show` (redacted) and `example` (annotated yml).
- `bin.ts` — `#!/usr/bin/env node` entry.

## 9. Container + CI

- `Dockerfile` — three-stage (deps/build/runtime) with BUILDPLATFORM,
  --link COPY, --mount=type=cache. See
  `.agents/skills/multi-arch-docker-with-cache.md`.
- `docker-compose.yml` and `docker-compose.dev.yml`.
- `.github/workflows/` — `ci.yml` (test + lint + alloy + coverage),
  `docker.yml` (multi-arch GHCR push), `release.yml` (tag-triggered npm
  publish with OIDC + Slack notify), `slack-notify.yml` (reusable
  composite).

## 10. Docs and examples

- `README.md` — badges, quickstart, full CLI + HTTP tables.
- `docs/design/` — architecture, parsing internals, HTTP reference, this
  guide.
- `examples/` — `basic-cli` walkthrough and `http-client` end-to-end.

## Verification checklist

```
npm ci
npm run lint && npm run typecheck && npm run test:coverage   # green, ≥ 90% coverage
npm run build && npm pack                                    # tarball has only dist + docs
scripts/run-alloy.sh                                         # every check UNSAT, every run SAT
node dist/cli/bin.js doctor                                  # ok across the board
node dist/cli/bin.js gogogo --headless --port 7150 &         # JSON line printed
curl localhost:7150/healthz                                  # 200 OK
docker buildx build --platform linux/amd64,linux/arm64 .     # both arches
```
