# ADR-0011: UI as an opt-in npm workspace

- **Status**: Accepted
- **Date**: 2026-05-14

## Context

The chat UI is a React + Vite + Tailwind app. Its build-time dependency
tree (Vite, React, Tailwind, PostCSS, autoprefixer, lucide-react) is
several hundred packages — large compared to the server's runtime deps.
Putting them all in the root `package.json` would slow `npm install` for
consumers who only need the headless app-server.

## Decision

The UI is a separate npm workspace at `ui/` with its own `package.json`.
The root `package.json` declares `"workspaces": ["ui"]` so a single
`npm install` at the repo root installs both — but consumers installing
from npm don't get the UI workspace because the `files` allowlist only
ships `dist/`, `LICENSE`, `README.md`, and the example yml.

At build time, `npm run build` runs `build:server` (tsup) and `build:ui`
(Vite via the workspace) in sequence. Vite emits to `<package-root>/dist/ui/`
so the server's static route finds the bundle in one place and the
published tarball contains it under `dist/`.

The UI is gated at runtime by `ui.enabled` in config (default false).
When disabled, the static route isn't even registered, and the UI bundle
is never read from disk.

## Consequences

**Easier**
- The runtime npm package stays small. Servers that only embed june15
  programmatically don't pay for React + Vite.
- One `npm install` at the repo root sets up both workspaces.
- The UI gets its own `tsconfig.json` (with JSX + DOM libs) and its own
  ESLint scope, separate from the strict server config.

**Harder**
- The root scripts have to know about both workspaces. `npm run build`
  composes two builds; `npm run dev:ui` is a convenience target for the
  Vite dev server.
- Contributors must run `npm install` once at the root for workspaces to
  resolve.

## Alternatives considered

- **One workspace, ui under src/** — Forces the UI's deps into the
  server's `package.json`. Consumers installing `june15` from npm would
  download Vite/React. Non-starter.
- **Separate repo** — Adds release coordination and version skew. Not
  worth it for a single-package project where UI + server ship together.
- **Vite served via a sub-package** (`@june15/ui` published as its own
  npm) — Possible future move when there are external consumers of the UI
  alone. Out of scope for v1.
