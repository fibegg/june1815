# ADR-0007: tsup (esbuild) as the bundler

- **Status**: Accepted
- **Date**: 2026-05-13

## Context

We need to produce three artifacts: library entrypoint, CLI bin, and a small `events` module that consumers can import for type-only access to event schemas. The build must emit ESM, generate `.d.ts` files, and stay configuration-light.

## Decision

We use **tsup** (esbuild under the hood). One `tsup.config.ts` declares the three entrypoints; `npm run build` runs both the JS bundle and `.d.ts` emission in one pass.

## Consequences

**Easier**
- Single tool for transpile + bundle + types.
- Sub-second incremental builds during `tsup --watch`.
- esbuild's tree-shaking removes unused exports from the published bundle.
- The banner mechanism lets us inject the ESM-CJS shim (`require`, `__dirname`) in one place.

**Harder**
- esbuild doesn't run full type-checking; that's `tsc --noEmit`'s job in CI. We rely on the discipline of running `npm run typecheck` alongside the build, which the `ci` script enforces.

## Alternatives considered

- **`tsc` alone** — Outputs files but doesn't bundle. We'd ship a sprawling `dist/` and pay the import-resolution tax at runtime.
- **Rollup + plugins** — More configurable, but the surface area we need is tsup's defaults. Rollup pays in plugin config we don't need.
- **`unbuild`** — Strong alternative; we picked tsup for the slightly broader ecosystem familiarity.
