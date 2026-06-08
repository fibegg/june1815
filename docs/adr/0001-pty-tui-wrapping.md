# ADR-0001: Wrap the interactive Claude TUI via PTY

- **Status**: Accepted
- **Date**: 2026-05-13

## Context

The official `claude` CLI ships with three observable modes:

1. **Interactive TUI** — full-screen ANSI, the experience a human uses at the terminal.
2. **`claude -p "..." --output-format stream-json`** — non-interactive, emits JSON Lines to stdout.
3. **Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)** — spawns the CLI binary internally using a private IPC channel and re-exports a typed `query()` async iterable.

june1815's job is to expose a long-lived HTTP app-server that other tools (IDEs, agent frameworks, automation) can drive — multiple turns, reasoning deltas, tool events, usage tokens, interrupt, steering, and OAuth flows. We need feature parity with what a human gets in the TUI, including affordances Anthropic has historically shipped to the interactive surface first (permission prompts, ASCII previews, MCP tool confirmations, slash commands).

## Decision

june1815 wraps the **interactive TUI** as a child process inside a real pseudo-terminal (`node-pty`). Output bytes are fed into a virtual VT emulator (`@xterm/headless`, see ADR-0005) and a parser extracts typed events from the resulting screen buffer. Input is delivered as keystrokes (text, `\x03` for Ctrl-C interrupt, `ESC` for steer).

We explicitly do **not** use `claude -p --output-format stream-json` for normal request/response. We do **not** depend on `@anthropic-ai/claude-agent-sdk`. Both leak Anthropic-internal IPC contracts and would diverge from the human-facing surface over time.

## Consequences

**Easier**
- Feature parity with the TUI by construction — anything a human can do in claude, june1815 can do.
- OAuth login, permission prompts, and trust dialogs work without a separate code path.
- june1815 has zero compile-time coupling to Anthropic's private SDK; only the user-facing CLI behavior is load-bearing.

**Harder**
- Parsing a rendered TUI is fragile. We mitigate via:
  - A large, fixed PTY geometry (`cols: 200, rows: 50` by default) so the TUI does not soft-wrap things we want to parse.
  - Replay-based unit tests: `tests/fixtures/tui-recordings/` stores raw byte streams from real sessions; tests assert the parser produces the right typed events deterministically.
  - Versioned compatibility: each release pins the `claude` versions it has been verified against and ships a `june1815 doctor` command that flags untested binary versions.
- We have to maintain the VT emulator integration as Anthropic evolves the TUI.

## Alternatives considered

- **`claude -p --output-format stream-json`** — Cleaner machine-readable surface, but rejects half the use-cases (OAuth, permission prompts, steering, slash commands) and would still need a second transport for those, defeating the "one wrapper" goal.
- **Direct use of `@anthropic-ai/claude-agent-sdk`** — Means depending on a private IPC contract that Anthropic does not promise to keep stable across releases of the SDK and CLI. Also re-exports the SDK's opinionated shape (`StreamingCallbacks`-style); june1815 should own its own HTTP contract.
- **Reverse-engineering the SDK's IPC** — Same downside as above, with extra reverse-engineering cost and ongoing maintenance burden.
