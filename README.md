# june1815

[![CI](https://github.com/fibegg/june1815/actions/workflows/ci.yml/badge.svg)](https://github.com/fibegg/june1815/actions/workflows/ci.yml)
[![Docker](https://github.com/fibegg/june1815/actions/workflows/docker.yml/badge.svg)](https://github.com/fibegg/june1815/actions/workflows/docker.yml)
[![npm version](https://img.shields.io/npm/v/june1815.svg)](https://www.npmjs.com/package/june1815)
[![codecov](https://codecov.io/gh/fibegg/june1815/branch/main/graph/badge.svg)](https://codecov.io/gh/fibegg/june1815)
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
npm i -g june1815
june1815 gogogo
```

```
[ok]     claude          /usr/local/bin/claude (v1.4.2)
[ok]     auth source     env_oauth
[ok]     http bind       127.0.0.1:7150
june1815 ready
  URL    http://127.0.0.1:7150
  bearer ad3f...e91c
```

## What this is

june1815 is a thin server that:

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
npm i -g june1815

# or one-shot run
npx june1815 doctor

# or Docker
docker run --rm -p 7150:7150 \
  -e CLAUDE_CODE_OAUTH_TOKEN=$CLAUDE_CODE_OAUTH_TOKEN \
  ghcr.io/fibegg/june1815:latest
```

Requirements: Node ≥ 22, an authenticated `claude` (`claude auth login`
or `CLAUDE_CODE_OAUTH_TOKEN`). If `claude` is not on `PATH`, `june1815 gogogo`
will offer to install it interactively or do so non-interactively under
`--auto-install` / `JUNE1815_AUTO_INSTALL=1`.

## CLI

```
june1815 gogogo [--host H] [--port N] [--auto-install] [--model M] [--effort low|...|max]
              [--headless | --interactive] [--config PATH] [--data-dir PATH]
              [--log-level LEVEL]

june1815 doctor                   # diagnose PATH, auth, geometry, bind target
june1815 config show              # resolved config tree (secrets redacted)
june1815 config example           # print the annotated example yml
june1815 --version
```

## HTTP API (Bearer auth everywhere except `/healthz`)

The bearer token accepted by the server may be carried as
`Authorization: Bearer <token>` (preferred for programmatic clients),
`?token=<token>` (for typing into a browser address bar), or as the
`june1815_token` cookie planted by the server after a successful header
or query auth (so static assets can fetch without an explicit header).
See [ADR-0010](./docs/adr/0010-bearer-everywhere-with-cookie.md).

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/healthz` | liveness + version (no auth) |
| `GET` | `/v1/auth/status` | `{authenticated, source, envKey?, path?}` |
| `POST` | `/v1/auth/token` | `{token}` — store in june1815's token file |
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
`june1815/events` subpath.

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
started with `JUNE1815_UI_ENABLED=1` (or `ui.enabled: true` in
`june1815.yml`). The UI is bundled with the npm package; nothing extra to
install or run.

```sh
JUNE1815_UI_ENABLED=1 june1815 gogogo
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
JUNE1815_UI_ENABLED=1 june1815 gogogo &   # in one terminal
npm run dev:ui                         # in another → http://localhost:5173
```

## Running from source (no npm install of `june1815`)

Use this when you're hacking on the package or want to try the UI before
the first npm publish.

### One-time setup

```sh
git clone https://github.com/fibegg/june1815.git
cd june1815
nvm use            # respects .nvmrc (Node 22)
npm install        # installs both root and the `ui` workspace
```

That single `npm install` resolves the workspace at `ui/`, so you don't
need to run `cd ui && npm install` separately.

### Test the UI with hot reload (Vite dev server)

This is the fastest loop for UI changes — Vite serves the React app on
:5173 with HMR, and proxies `/v1/*` and `/healthz` to a real `june1815`
server you start separately. You don't need `JUNE1815_UI_ENABLED` here
because the API server isn't the one serving the UI.

```sh
# terminal 1 — build the server once, then run it
npm run build:server
node dist/cli/bin.js gogogo --headless --port 7150
# stdout prints a single line:  {"url":"http://127.0.0.1:7150","token":"<bearer>"}
```

```sh
# terminal 2 — Vite dev server, proxying API calls
npm run dev:ui
#  ➜  Local:   http://localhost:5173/
```

Open `http://localhost:5173/?token=<bearer>` (paste the token from
terminal 1). The TokenGate captures it once; reloads keep you logged in
via sessionStorage. Edit any `ui/src/**` file and the browser updates in
under a second.

### Test the UI exactly as users will see it (bundled flow)

This runs the built UI from the same Node process serving the API —
the same code path a freshly-installed npm copy would execute.

```sh
npm run build                         # builds server + UI into dist/
JUNE1815_UI_ENABLED=1 \
  node dist/cli/bin.js gogogo         # interactive: opens with a clack TUI
# or
JUNE1815_UI_ENABLED=1 \
  node dist/cli/bin.js gogogo --headless --port 7150
```

In interactive mode the boot output prints the URL and bearer; in
headless mode it prints one JSON line. Open the URL with `?token=...`
appended.

### Skip the build step (faster inner loop on the CLI/server side)

For server-only changes, run the TypeScript entry directly through `tsx`
— no build, no `dist/`:

```sh
npm install --no-save tsx              # if not already there transitively
npx tsx src/cli/bin.ts gogogo --headless --port 7150
```

This still requires `JUNE1815_UI_ENABLED=1` plus an existing `dist/ui/` if
you want the UI; pure API/server hacking doesn't need either.

### Use june1815 as a library in another project (before publish)

Two paths.

**`npm link`** — global symlink, no rebuild on every change:

```sh
# in june1815
npm run build
npm link

# in your consumer project
npm link june1815
node -e "import('june1815').then((m) => console.log(Object.keys(m)))"
```

Re-run `npm run build` in `june1815` whenever you change source files;
the symlink picks up the new `dist/` immediately.

**`npm pack`** — a real local tarball for the closest-to-published
behavior:

```sh
# in june1815
npm run build
npm pack               # writes june1815-0.0.0.tgz

# in your consumer
npm install /absolute/path/to/june1815-0.0.0.tgz
```

### Run the e2e suite locally

```sh
# requires: `claude` on PATH and an authenticated source
# (CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY, or `claude auth login`)
npm run build:server
npm run test:e2e
```

Without claude or a token the suite skips with a clear stderr line
(`[e2e] skipping suite: ...`) and exits 0 — no need to fake anything.

### Reset state

```sh
npm run clean             # deletes dist/, coverage/, .vitest-cache/
rm -rf ~/.local/share/june1815        # purges saved bearer + session markers
rm -rf /tmp/june1815-e2e-*            # any orphaned e2e temp dirs
```

## Using `june1815` as a drop-in `claude` wrapper (stream-JSON shim mode)

Any tool that spawns the `claude` CLI in its stream-JSON IPC mode —
the official `@anthropic-ai/claude-agent-sdk`, custom SDK clients, the
`-p` print mode — can spawn `june1815` instead and get back the same
wire shape. Internally, `june1815` drives the real `claude` through its
TUI, parses the screen, and re-emits each event as the matching
stream-JSON message on stdout.

Point the consumer at `june1815` and set one env var:

```bash
export JUNE1815_CLAUDE_PATH=$(which claude)
# Then point whatever currently spawns `claude` at `june1815` instead.
```

Smoke test it directly with newline-delimited JSON on stdin/stdout:

```bash
echo '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"reply with exactly: HELLO"}]}}' \
  | june1815 --output-format stream-json --verbose --input-format stream-json --model claude-opus-4-7
```

The shim activates automatically whenever it sees
`--output-format stream-json`, `--input-format stream-json`, `-p`, or
`--print`. With any other invocation, `june1815` behaves as the normal
`gogogo` / `doctor` / `config` CLI.

See [`docs/design/shim-mode.md`](./docs/design/shim-mode.md) for the
full wire-protocol spec and arg-filtering rules.

## Custom tool plugins

When `june1815` reports a tool call (`tool_use`) on the wire, it
synthesizes a structured `input` object from the TUI's view of the
tool. Built-in mappings cover well-known claude tools out of the box
(`Read`, `Bash`, `Edit`, `Grep`, `WebFetch`, …). Custom or MCP tools
get a `{summary: "<raw>"}` fallback unless you ship a tool-defs file:

```jsonc
// ~/.config/june1815/tool-defs.json
{
  "version": 1,
  "tools": {
    "acme__find_user": {
      "summaryRegex": "^(?<user>\\S+)\\s+in\\s+(?<org>\\S+)$",
      "input": { "username": "{user}", "scope": "{org}" }
    }
  }
}
```

Discovery order (later wins): built-ins → `JUNE1815_TOOL_DEFS` env var
(`:`-separated paths) → `~/.config/june1815/tool-defs.json` →
`--tool-defs` CLI flag (repeatable).

See [`docs/design/tool-plugins.md`](./docs/design/tool-plugins.md) for
the full spec and more examples.

## Configuration

CLI flags > `process.env` (`JUNE1815_*`) > `./june1815.yml` >
`~/.config/june1815/june1815.yml` > defaults.

- See [`.env.example`](./.env.example) for every env key.
- See [`june1815.example.yml`](./june1815.example.yml) for the annotated YAML.
- Run `june1815 config show` for the live resolved tree.

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
