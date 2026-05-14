# ADR-0013: Centralized TUI rule registry

- **Status**: Accepted
- **Date**: 2026-05-14

## Context

The Claude Code TUI is the only contract june15 has with `claude`, and
it changes frequently. Across just the first two rounds of real-world
testing we had to react to:

- Workspace-trust dialogs on first entry into a cwd
- Footer text that flips between `? for shortcuts`, `⏵⏵ bypass
  permissions on`, `⏵ accept edits`, `⏵ plan mode on`
- Past-tense turn summaries (`✻ Brewed for 2s`) that look like reasoning
  but aren't
- Spinner status lines (`· Simmering…`, `✢ Deciphering…`) that look like
  content but aren't
- `⎿` continuation markers for help tips that look like response prefixes
- Multi-turn buffer layouts where a previous response can prefix the
  current one on the same buffer row
- Permission dialogs vs `⎿ Tip:` lines that incidentally contain "Run"
  and "?"
- A bypass-mode keyboard shortcut footer that pre-empts the default
  ready hint

The first parser was a single TS file with inline regexes. Every
revision added more inline branches; the code grew hard to read,
impossible to diff cleanly, and the regexes were never co-located with
their purpose.

## Decision

All TUI parsing transformations live under `src/pty/tui/` in a layered,
declarative architecture. Five files; each one has a single concern.

```
src/pty/tui/
  markers.ts     — every regex that matches a single rendered line.
                    Named, documented, exported as `MARKERS[name].pattern`.
                    No inline regexes anywhere else.
  transforms.ts  — pure text post-processors (trim, dedup, etc.).
                    Each is a function; the pipeline composes them.
  anchoring.ts   — "where does the current turn's response start?"
                    finds the most recent non-placeholder user echo.
  extractors.ts  — declarative rules, one per emitted event type.
                    Each rule names its start marker, its stops, its
                    skips, its transforms, and its emit function.
  engine.ts      — runs the catalogue against a TerminalSnapshot.
                    The only place that orchestrates extractors;
                    contains no regex literals.
```

A new `TuiEvent` type = add one entry to `extractors.ts`. A Claude UI
revision that changes a marker = edit one line in `markers.ts`. The
engine never changes.

`tui-parser.ts` is kept as a backwards-compat shim that delegates to
the engine so existing consumers (Conversation, tests) don't break.

## Consequences

**Easier**

- Diffs are tight. Most fixes are one-line edits to a single file.
- Each extractor is independently unit-testable in isolation.
- Replay fixtures (`tests/fixtures/tui-recordings/*.json`) become the
  primary correctness tool. Capture a session once; run the engine
  against it forever.
- Debug output is straightforward: each rule has a `purpose` string;
  the engine can log "rule X matched on line Y" with no extra wiring.
- Future Claude-CLI version pinning slot: add a `MARKER_SETS_BY_VERSION`
  registry; engine picks the right one from `claude --version`. We
  don't ship this yet, but the architecture admits it without
  restructuring.

**Harder**

- One extra indirection. A regex change now lives in `markers.ts`, not
  next to the extractor that consumes it. The `purpose` field
  mitigates by spelling out what the marker is for.
- Naming discipline matters. `userEcho` vs `userEchoPlaceholder` vs
  `assistantStart` vs `toolCall` — get the line classifications right
  or extractors mis-anchor. Each marker has a test in
  `tui-parser.test.ts` to lock the boundary.

## Alternatives considered

- **Keep inline regexes, just add more comments** — won't scale. Each
  Claude UI revision touches several call sites; PRs become diff stew.
- **Stream-JSON via `claude -p`** — explicitly out of scope per the
  project rule "no `claude -p` — only PTY wrapping the real TUI".
- **One giant state machine** — every transition would need to know
  every TUI shape. The data-driven registry is the same state machine
  flattened into configs that compose.
