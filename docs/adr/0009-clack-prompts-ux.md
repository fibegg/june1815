# ADR-0009: `@clack/prompts` for interactive CLI UX

- **Status**: Accepted
- **Date**: 2026-05-13

## Context

The CLI has two modes: **interactive** (TTY attached, used by humans) and **headless** (no TTY, used by CI/scripts/Docker). Interactive mode should ask questions when needed — e.g., "claude is not installed, install it? [y/N]". Headless mode must never block on a prompt; it either reads the answer from a flag/env var or fails with an actionable message.

## Decision

We use **`@clack/prompts`** for interactive UX (`confirm`, `text`, `select`, `spinner`, `intro`/`outro`). Every prompt is gated on `process.stdout.isTTY && config.mode === 'interactive'`. In headless mode, the same code path checks the relevant CLI flag or environment variable; if not set, it logs a structured error to stderr and exits non-zero.

## Consequences

**Easier**
- One prompts library for the whole CLI; consistent styling and accessibility (screen-reader friendly markers).
- Built-in cancel handling (`Ctrl-C` produces a clean cancellation, not a stack trace).
- Clean separation of "ask the human" from "read the headless decision".

**Harder**
- We must remember to never call a prompt from a code path that runs in headless mode without a flag/env override. Lint rule: any call to a `@clack/prompts` helper must be in a function whose name starts with `prompt` (enforced by ESLint custom rule in a future ADR if violations recur).

## Alternatives considered

- **`inquirer`** — Mature, widely used; bundle size is larger and its styling defaults feel dated.
- **`prompts`** (the npm package) — Smaller, simpler API; less polished output than clack and weaker cancellation semantics.
- **Hand-rolled `readline`** — More control, but cancellation, multi-line input, and accessibility all become our problem.
