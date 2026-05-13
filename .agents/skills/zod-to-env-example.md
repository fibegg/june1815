# zod schema → single source of truth

## When to use

Any app with non-trivial configuration. The drift between "what the code
reads" and "what the docs say" is one of the most common deployment
pitfalls. Cut it at the root by generating the docs from the code.

## Layers we use

1. **`schema.ts`** — a zod schema describing every config leaf with
   defaults and validation. This is the *runtime* contract.
2. **`env-keys.ts`** — a flat catalogue mapping each ENV var to its YAML
   path, type, description, and `secret` flag. This is the *external*
   contract (what users type).
3. **`render-env-example.ts`** — a pure function that produces the
   `.env.example` text from the catalogue.
4. **`scripts/gen-env-example.ts`** — `npm run gen:env-example` writes
   the file to the repo root.
5. **A drift test** — `tests/unit/config/render-env-example.test.ts`
   compares the checked-in `.env.example` against the renderer output
   and fails CI if they disagree.

## Why two files instead of one giant schema

`schema.ts` describes *shape* (nested objects, defaults, validation).
`env-keys.ts` is the *flat projection* (env name, dot-path, type,
description, secret). The flat list is what the loader and the
documentation generator walk. Keeping it separate from the schema means
adding a new env key takes one focused edit, not a multi-file refactor.

## Loader hygiene

The loader is a pure function: `(cli, env, fs, paths) -> Config`.
- No `process.env` reads outside the loader.
- No singletons; tests instantiate fresh.
- Failure returns a typed `June15Error('config_invalid')` with a
  human-readable issue list.

## Where it shows up in june15

- `src/config/schema.ts`, `src/config/env-keys.ts`, `src/config/loader.ts`.
- `src/config/render-env-example.ts` + `scripts/gen-env-example.ts`.
- The drift test in `tests/unit/config/render-env-example.test.ts`.
