# ADR-0004: Config precedence CLI > ENV > YAML > defaults

- **Status**: Accepted
- **Date**: 2026-05-13

## Context

june1815 reads configuration from up to four sources: command-line flags, environment variables, a `june1815.yml` file (project-local or per-user), and built-in defaults. Operators expect a deterministic, well-known precedence — every "is my flag being applied?" question must have a single answer.

## Decision

Highest-precedence wins:

```
CLI args  >  process.env  >  ./june1815.yml  >  ~/.config/june1815/june1815.yml  >  built-in defaults
```

A single `zod` schema in `src/config/schema.ts` describes every leaf with its type, default, ENV key, and YAML path. From that schema we **generate** `.env.example`, `june1815.example.yml`, and `june1815.schema.json` — there is no second source of truth.

The loader is a pure function: `loadConfig(argv, env, fsFacade) → Config | ConfigError`. No globals; no implicit `process.env` reads outside the loader.

## Consequences

**Easier**
- "Does this flag work in YAML?" — yes for every key, by construction.
- The `june1815 config show` command prints the resolved tree with the source of each leaf, so operators can diagnose precedence without reading source.
- The loader is trivially testable with synthetic argv + env + fs.

**Harder**
- The schema becomes the bottleneck for adding configuration. We accept this — it's a feature, not a bug. Every new env key must be a schema change with a test.
- Alloy spec `auth_config_priority.als` proves resolution is total, deterministic, and monotone.

## Alternatives considered

- **YAML > ENV** — Some tools work this way so YAML can pin values. Rejected because the standing convention in cloud-native tooling is ENV > YAML, and operators expect to override with `JUNE1815_FOO=bar` without editing files.
- **Free-form merge** — No precedence rule; later loads "deep merge" earlier loads. Hides the answer to "where is this value coming from" and makes the Alloy spec impossible.
