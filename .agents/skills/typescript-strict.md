# TypeScript strict mode (full)

## When to use

Every new TypeScript project. The full strict surface is borderline free —
the cost is a few annotations during initial development, the payoff is
real bug-prevention at compile time.

## Flags we enable

In `tsconfig.json`:

- `strict: true` — turns on the foundational set.
- `noUncheckedIndexedAccess: true` — `arr[0]` is `T | undefined`. Forces
  defensive coding around array/object indexing.
- `exactOptionalPropertyTypes: true` — `foo?: T` and `foo: T | undefined`
  are not interchangeable. Catches accidental "set the key to undefined to
  unset" patterns.
- `noImplicitOverride: true` — every `override` is explicit.
- `noUnusedLocals`, `noUnusedParameters` — keeps the symbol surface clean.
- `noFallthroughCasesInSwitch`, `noImplicitReturns` — control-flow
  completeness.
- `verbatimModuleSyntax: true` — type-only imports must say `import type`,
  preventing accidental runtime imports.
- `useUnknownInCatchVariables: true` — `catch (err)` is `unknown`.
- `isolatedModules: true` — each file is transpilable in isolation,
  required by ESM tooling.

## Gotchas

- `verbatimModuleSyntax` interacts with re-exports. Use
  `export type { Foo } from '...'` instead of `export { type Foo } from '...'`
  in inline syntax — TypeScript is strict about both, ESLint
  (`@typescript-eslint/consistent-type-imports`) helps catch slips.
- `noUncheckedIndexedAccess` makes `Object.entries(obj)` typed as
  `[string, T | undefined][]` which forces `?? defaultValue` at every
  consumer. Live with it; the alternative is silent reads of missing keys.

## Where it shows up in june15

- `tsconfig.json` — every flag enumerated.
- `src/config/loader.ts:setDeep` and similar functions use `parts[i]!`
  with care because `parts.length` is known. We accept the assertion in
  exchange for the safer indexed-access default elsewhere.
- The DeepPartial type in `src/cli/cli-options.ts` exists because
  `exactOptionalPropertyTypes` rejects "shape-compatible" partials.
