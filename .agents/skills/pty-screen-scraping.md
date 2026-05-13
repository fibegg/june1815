# PTY screen scraping

## When to use

When the only stable surface you have to wrap is a human-facing TUI, and
no `--json` / `--script` mode is available *or* the script mode loses
features (OAuth flows, permission prompts, slash commands).

If a JSON mode covers everything you need, prefer that. PTY scraping is
load-bearing maintenance: every TUI redesign costs you.

## Stack

1. **`node-pty`** — real PTY semantics, cross-platform-ish (Windows is
   different enough that you might want to gate it behind a config
   flag).
2. **`@xterm/headless`** — the same VT emulator VSCode uses, in headless
   form. Maintains an in-memory cell buffer from raw ANSI bytes. Don't
   write a parser yourself — escape-sequence corners are deep.
3. **A pattern-driven parser** — every "I emit X when I see Y" rule is a
   regex against the rendered text. Externalize the regex set so future
   TUI revisions are a config change.

## Snapshot strategy

Don't snapshot per-byte; you'll burn CPU. Don't snapshot only when idle;
a continuously-streaming response will never go idle. Use two timers:

- A **debounce** — fires `idleQuietMs` (default 10ms) after the last
  data byte; resets on each byte.
- A **burst cap** — fires `maxBurstMs` (default ~200ms) after the
  *first* byte of a burst; single-shot.

Either firing calls `snapshot()`. After the snapshot, both timers are
cleared and rescheduled on next data. This pattern keeps the parser
responsive (debounce) while guaranteeing forward progress under sustained
load (burst cap).

## Diff math

The TUI re-renders regions in place. Your parser should:

1. Identify the region (assistant text block, reasoning block, footer).
2. Compute the *current* string for that region.
3. Compare against the *previous* string (the "high-water mark").
4. Emit `delta = current.startsWith(prev) ? current.slice(prev.length) : current`.

The `startsWith` fallback handles re-renders: if the TUI repainted the
block, emit the whole thing and let the receiver tolerate the small
churn.

## Where it shows up in june15

- `src/pty/terminal.ts` — xterm-headless adapter.
- `src/pty/tui-parser.ts` — pattern-driven, `__test.computeDelta` exported
  for direct testing.
- `src/conversation/conversation.ts` — `scheduleSnapshot` + `snapshotInternal`
  implement the two-timer pattern.
