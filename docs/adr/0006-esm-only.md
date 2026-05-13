# ADR-0006: ESM-only package distribution

- **Status**: Accepted
- **Date**: 2026-05-13

## Context

Node.js, npm, and the ecosystem have largely converged on ESM. Modern dependencies (Hono, `@clack/prompts`, `chalk` v5+, many testing tools) are ESM-only. Dual CJS/ESM publishing is a known footgun: divergent module identity, mis-routing of `require` vs `import`, and the dual-package-hazard.

## Decision

june15 ships **ESM only**. `package.json` declares `"type": "module"`. The `exports` map publishes only `import` conditions. The CLI bin uses a `#!/usr/bin/env node` shebang on an ESM file.

Consumers that need CJS interop can use Node's dynamic `import('june15')`, or upgrade their package to ESM.

## Consequences

**Easier**
- No dual-build complexity, no `cjs/` directory, no `.cjs` mirror.
- Type-only imports and `verbatimModuleSyntax` work cleanly.
- Top-level await is available in our own code where helpful.

**Harder**
- Some old test runners (Jest <29 without ESM config, Mocha pre-10) can't load june15 directly without configuration. We accept this as a forcing function for consumers to upgrade.
- Native dependencies like `node-pty` ship CJS internals; we handle the `require`/`__dirname` shim in the tsup banner (see [tsup.config.ts](../../tsup.config.ts)).

## Alternatives considered

- **Dual CJS + ESM** — Doubles build artifacts, opens up the dual-package hazard, and requires conditional exports tuning that breaks subtly. Not worth the carrying cost for a new package in 2026.
- **CJS only** — Forecloses on ESM-only dependencies we already chose (Hono, clack). Non-starter.
