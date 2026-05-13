# PTY → TUI parsing

The hard part of june15. Walk through it once and the rest of the codebase
is easy to follow.

## Why we don't `claude -p`

The official CLI supports a non-interactive mode (`claude -p --output-format
stream-json`). It is clean, machine-readable, and would let us skip the PTY
entirely. We rejected it (see [ADR-0001](../adr/0001-pty-tui-wrapping.md))
because it would force us to maintain a parallel code path for everything
the interactive TUI ships first: OAuth login URLs, permission dialogs, MCP
install prompts, slash commands, future TUI-only affordances. By wrapping
the TUI we get whatever a human gets, plus the same set of failure modes.

## Pipeline

```
node-pty.spawn(claude)                  -> raw byte stream
   |
   v
TerminalAdapter (xterm-headless)        -> in-memory screen buffer
   |
   v (after idleQuietMs of quiet)
TerminalAdapter.snapshot()              -> { lines[], cursor, viewport }
   |
   v
TuiParser.parse(snapshot)               -> [TuiEvent, ...]
   |
   v
Conversation event stream               -> bridge -> SSE event
```

## Why xterm-headless?

Naive regex over the byte stream fails on the first cursor-positioning
escape. The TUI rewrites regions in place — what looks like "new text" in
the bytes is often a re-render of the same panel. We need a real VT
emulator that maintains a cell buffer. Building one would take months;
xterm-headless is the same VT implementation used inside VSCode. We pay
the dependency weight and skip the maintenance.

## Snapshot timing

Each PTY data event:

1. Forwards the bytes to `TerminalAdapter.write(d)` (awaited so xterm's
   parser flushes before we read).
2. Schedules a snapshot. Two timers:
   - `dataTimer` — fires `idleQuietMs` after the last data event. Resets
     on each event. Lets us batch a burst of bytes into one parse.
   - `burstTimer` — single-shot, fires `maxBurstMs` after the first event
     of a burst. Guarantees forward progress even if data trickles
     continuously.

Either timer firing calls `snapshotInternal()` which awaits any pending
`terminal.write` and runs the parser.

## TuiParser pattern set

`TuiParser` is pattern-driven. `DEFAULT_PATTERNS` (`src/pty/tui-parser.ts`)
exports regexes for:

| Pattern | Default | Emits |
| --- | --- | --- |
| `readyMarker` | `/^\s*[│┃║]\s*>\s/u` | `ready` |
| `assistantBlockStart` | `/^\s*●\s+/u` | `text_delta` |
| `reasoningBlockStart` | `/^\s*✻\s+(Thinking\|Pondering\|Reasoning)/iu` | `reasoning_delta` |
| `toolCallLine` | `/^\s*⏺\s+(\w+)\(([^)]*)\)/u` | `tool_use` |
| `usageLine` | `/Usage:\s*(\d+)\s*in\s*\/\s*(\d+)\s*out/iu` | `usage` |
| `oauthUrl` | `/(https?:\/\/[^\s]*claude\.ai[^\s]*)/iu` | `auth_required` |
| `permissionPrompt` | `/(allow\|approve\|run\|continue\|confirm).+[?]/iu` | `permission_prompt` |
| `blockEnd` | `/^\s*[─━═]{3,}|^\s*[│┃║]\s*>\s|^\s*Usage:/u` | terminates a region |

When Anthropic ships a TUI revision that changes one of these landmarks,
the fix is to update the pattern, not to touch the diff/delta logic.

## Replay-based tests

Real-world fixtures of captured ANSI bytes go under
`tests/fixtures/tui-recordings/`. Tests feed them through
`TerminalAdapter` and assert the parser produces the right events. This
keeps the suite deterministic and lets contributors verify behavior
without a live `claude` binary.

## What can go wrong

- **Soft wrap**: if the PTY cols are smaller than the longest TUI line,
  text wraps and the parser sees split lines. Mitigation: default to
  `cols: 200`, configurable via `JUNE15_PTY_COLS`.
- **Alternate buffer**: some claude features switch to the alternate
  screen (similar to vim). xterm-headless tracks alternate buffers
  natively; our snapshot reads the active buffer, which is the right
  one.
- **Reasoning truncation**: long reasoning blocks may scroll past the
  viewport. We snapshot the full buffer (viewport + scrollback), so the
  parser can still extract them.
