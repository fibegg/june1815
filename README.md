# june15

[![CI](https://github.com/fibegg/june15/actions/workflows/ci.yml/badge.svg)](https://github.com/fibegg/june15/actions/workflows/ci.yml)
[![Docker](https://github.com/fibegg/june15/actions/workflows/docker.yml/badge.svg)](https://github.com/fibegg/june15/actions/workflows/docker.yml)
[![npm version](https://img.shields.io/npm/v/june15.svg)](https://www.npmjs.com/package/june15)
[![codecov](https://codecov.io/gh/fibegg/june15/branch/main/graph/badge.svg)](https://codecov.io/gh/fibegg/june15)
[![Node ≥ 22](https://img.shields.io/badge/node-%E2%89%A522-43853d?logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Alloy 6.2.0](https://img.shields.io/badge/alloy-6.2.0-7459dc)](./docs/alloy/)

Wrap the official **Claude CLI**'s interactive TUI in a real pseudo-terminal
(`node-pty`), parse the rendered screen with a headless VT emulator, and
re-expose the running session as an HTTP app-server (REST + Server-Sent
Events). One process per conversation, full feature parity with the
human-facing TUI — OAuth flows, permission prompts, steering, and reasoning
streams included.

```sh
npm i -g june15
june15 gogogo
```

```
[ok]     claude          /usr/local/bin/claude (v1.4.2)
[ok]     auth source     env_oauth
[ok]     http bind       127.0.0.1:7150
june15 ready
  URL    http://127.0.0.1:7150
  bearer ad3f...e91c
```

## What this is

june15 is a thin server that:

1. **Spawns** `claude` (the interactive TUI, not `claude -p`) inside a
   PTY, one process per conversation.
2. **Reads** the raw byte stream into [`@xterm/headless`](https://www.npmjs.com/package/@xterm/headless)
   to maintain a virtual screen buffer.
3. **Parses** typed events (`text_delta`, `reasoning_delta`, `tool_use`,
   `usage`, `interrupted`, `done`, …) out of the rendered TUI.
4. **Streams** those events to HTTP clients via Server-Sent Events, with
   a REST control plane for conversations, interrupts, queueing, steering,
   and auth.

The result is a local app-server you can drive from any HTTP client — IDE
plugins, agent frameworks, automation scripts — without coupling to
Anthropic's private SDK protocol.

See [docs/design/architecture.md](./docs/design/architecture.md) for the
full picture.

## Install

```sh
# global CLI
npm i -g june15

# or one-shot run
npx june15 doctor

# or Docker
docker run --rm -p 7150:7150 \
  -e CLAUDE_CODE_OAUTH_TOKEN=$CLAUDE_CODE_OAUTH_TOKEN \
  ghcr.io/fibegg/june15:latest
```

Requirements: Node ≥ 22, an authenticated `claude` (`claude auth login`
or `CLAUDE_CODE_OAUTH_TOKEN`). If `claude` is not on `PATH`, `june15 gogogo`
will offer to install it interactively or do so non-interactively under
`--auto-install` / `JUNE15_AUTO_INSTALL=1`.

## CLI

```
june15 gogogo [--host H] [--port N] [--auto-install] [--model M] [--effort low|...|max]
              [--headless | --interactive] [--config PATH] [--data-dir PATH]
              [--log-level LEVEL]

june15 doctor                   # diagnose PATH, auth, geometry, bind target
june15 config show              # resolved config tree (secrets redacted)
june15 config example           # print the annotated example yml
june15 --version
```

## HTTP API (Bearer auth everywhere except `/healthz`)

The bearer token accepted by the server may be carried as
`Authorization: Bearer <token>` (preferred for programmatic clients),
`?token=<token>` (for typing into a browser address bar), or as the
`june15_token` cookie planted by the server after a successful header
or query auth (so static assets can fetch without an explicit header).
See [ADR-0010](./docs/adr/0010-bearer-everywhere-with-cookie.md).

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/healthz` | liveness + version (no auth) |
| `GET` | `/v1/auth/status` | `{authenticated, source, envKey?, path?}` |
| `POST` | `/v1/auth/token` | `{token}` — store in june15's token file |
| `DELETE` | `/v1/auth` | clear token file |
| `GET` | `/v1/conversations` | list |
| `POST` | `/v1/conversations` | `{cwd, id?, model?, effort?, systemPromptAppend?}` → 201 |
| `GET` | `/v1/conversations/:id` | summary |
| `DELETE` | `/v1/conversations/:id` | 204 |
| `POST` | `/v1/conversations/:id/messages` | `{text, attachments?}` → **SSE stream** until `done` |
| `POST` | `/v1/conversations/:id/interrupt` | abort in-flight turn |
| `POST` | `/v1/conversations/:id/queue` | `{text, attachments?}` — enqueue without streaming |
| `POST` | `/v1/conversations/:id/steer` | `{text}` — steer the in-flight turn |

SSE event types: `text_delta`, `reasoning_delta`, `tool_use`, `usage`,
`interrupted`, `done`, `error`, `auth_required`, `permission_prompt`,
`ping`. Schemas live in `src/server/events.ts` and re-export as the
`june15/events` subpath.

### Attaching images and files

Both `/messages` and `/queue` accept an optional `attachments` array.
Each entry is `{ kind: 'image' | 'file', dataUrl, name?, contentType? }`
where `dataUrl` is the standard `data:<mime>;base64,<bytes>` form. Files
are sanitized, written to
`<dataDir>/uploads/<conversationId>/<messageId>/<name>`, and referenced
as `@<absolute-path>` lines prepended to the user text — the convention
`claude` uses to attach a local file to a turn.

```sh
curl -N -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -X POST $URL/v1/conversations/$CID/messages \
     -d "$(jq -n --arg img "$(base64 < photo.png)" '{
            text: "what is in this image?",
            attachments: [{ kind: "image", dataUrl: ("data:image/png;base64," + $img), name: "photo.png" }]
          }')"
```

## Chat UI (optional)

A React + Tailwind + shadcn-style chat lives at `/` when the server is
started with `JUNE15_UI_ENABLED=1` (or `ui.enabled: true` in
`june15.yml`). The UI is bundled with the npm package; nothing extra to
install or run.

```sh
JUNE15_UI_ENABLED=1 june15 gogogo
# open the URL with `?token=<bearer>` once; the SPA captures the token,
# strips it from the address bar, and the bearer-set cookie carries
# auth across asset fetches.
```

The UI supports: creating and switching between conversations, streaming
SSE events (text + reasoning + tool calls + usage), Enter-to-send,
Shift+Enter for newline, Enter-while-busy to steer, drag-drop / paste /
file-picker image attachments, and a one-click interrupt.

UI dev mode (proxies API calls to a running server on 7150):

```sh
JUNE15_UI_ENABLED=1 june15 gogogo &   # in one terminal
npm run dev:ui                         # in another → http://localhost:5173
```

## Configuration

CLI flags > `process.env` (`JUNE15_*`) > `./june15.yml` >
`~/.config/june15/june15.yml` > defaults.

- See [`.env.example`](./.env.example) for every env key.
- See [`june15.example.yml`](./june15.example.yml) for the annotated YAML.
- Run `june15 config show` for the live resolved tree.

## Docs

- [`docs/design/`](./docs/design/) — architecture and replication guide.
- [`docs/adr/`](./docs/adr/) — every non-trivial decision recorded.
- [`docs/alloy/`](./docs/alloy/) — runnable Alloy 6 spec suites covering
  session lifecycle, message queue, auth/config priority, and HTTP API
  contract.
- [`.agents/skills/`](./.agents/skills/) — internal skill notes on the
  best practices applied across the codebase.
- [`examples/`](./examples/) — sample clients.

## Contributing

`npm ci && npm run ci` to run the full check loop. Tests use Vitest;
lint with ESLint flat config; formatting via Prettier. Alloy specs run
with `scripts/run-alloy.sh` (Alloy 6.2.0 + OpenJDK 21).

End-to-end tests (`npm run test:e2e`) spawn the built CLI as a child
process and drive the full API surface — including streaming,
queueing, steering, interrupt, and image attachments. They skip
cleanly when `claude` is not on PATH or no authentication source is
present, so first-time contributors aren't blocked.

See [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md).

## License

MIT. See [`LICENSE`](./LICENSE).
