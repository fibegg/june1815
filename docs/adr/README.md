# Architecture Decision Records

This directory captures non-trivial design decisions for june15.

Each ADR is short, decision-focused, and append-only — superseded ADRs stay in
the tree and link forward to their replacement. New entries copy
[`0000-template.md`](./0000-template.md), pick the next free four-digit number,
and follow the same Context → Decision → Consequences → Alternatives shape.

| # | Title | Status |
| --- | --- | --- |
| [0001](./0001-pty-tui-wrapping.md) | Wrap the interactive Claude TUI via PTY | Accepted |
| [0002](./0002-one-process-per-conversation.md) | One `claude` child process per conversation | Accepted |
| [0003](./0003-rest-sse-transport.md) | REST + Server-Sent Events for the HTTP transport | Accepted |
| [0004](./0004-config-merge-priority.md) | Config precedence CLI > ENV > YAML > defaults | Accepted |
| [0005](./0005-xterm-headless-vt-emulation.md) | `@xterm/headless` as the VT emulator for TUI parsing | Accepted |
| [0006](./0006-esm-only.md) | ESM-only package distribution | Accepted |
| [0007](./0007-tsup-bundler.md) | tsup (esbuild) as the bundler | Accepted |
| [0008](./0008-hono-http-framework.md) | Hono as the HTTP framework | Accepted |
| [0009](./0009-clack-prompts-ux.md) | `@clack/prompts` for interactive CLI UX | Accepted |
| [0010](./0010-bearer-everywhere-with-cookie.md) | Bearer on every route; cookie carry-over for asset fetches | Accepted |
| [0011](./0011-ui-as-npm-workspace.md) | UI as an opt-in npm workspace under `ui/` | Accepted |
| [0012](./0012-attachments-as-data-urls.md) | Attachments delivered as base64 data URLs in the message body | Accepted |
