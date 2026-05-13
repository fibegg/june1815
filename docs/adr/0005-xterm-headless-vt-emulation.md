# ADR-0005: `@xterm/headless` as the VT emulator for TUI parsing

- **Status**: Accepted
- **Date**: 2026-05-13

## Context

ADR-0001 commits us to parsing the rendered Claude TUI. The raw PTY byte stream is a mix of plain text and ANSI escape sequences that move the cursor, clear regions, toggle alternate buffers, set colors, and request terminal queries. Naive regex over the bytes does not work — claude redraws regions in place, and many "deltas" we want to emit are actually re-renders of an entire panel.

We need an in-memory model that, given the byte stream, produces a stable representation of "what the user sees right now". Then the parser can diff the previous snapshot against the new snapshot and emit deltas.

## Decision

We use **`@xterm/headless`** as the VT emulator. After every quiet period (>10 ms idle), the parser reads cells from the emulator's buffer and produces a plain-text projection plus per-cell metadata. Region matchers then identify the assistant text block, reasoning block, tool-use cards, and status footer.

## Consequences

**Easier**
- xterm.js is the same VT implementation used by VSCode and many other tools; its conformance is well-tested.
- `Terminal.write(bytes)` accepts the raw PTY output verbatim — no preprocessing, no ANSI parser of our own.
- The buffer API is stable and well-documented.

**Harder**
- `@xterm/headless` is a substantial dependency (~200 KB minified). Acceptable given it's a server-side package, not browser-shipped.
- We must avoid leaking xterm objects across the package boundary — the public types remain plain TypeScript records.

## Alternatives considered

- **Hand-rolled VT100 parser** — Significant ongoing maintenance for terminal corner cases (DECRQM queries, alternate buffers, scroll regions). The xterm team already maintains this for us.
- **`node-ansiparser` + custom buffer** — Lower-level; same maintenance hazard at the cell-buffer layer.
- **String-strip ANSI, parse plain text** — Loses positional information (which line is the assistant block, where the footer starts), so we can't reliably tell "still streaming" from "done".
