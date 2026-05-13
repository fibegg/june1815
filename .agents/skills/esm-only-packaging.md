# ESM-only packaging

## When to use

New Node packages in 2026+. CommonJS is in slow decline; popular
ecosystem libraries (Hono, @clack/prompts, chalk v5+, etc.) ship ESM
only. Publishing dual CJS/ESM doubles your build artifacts and exposes
you to the dual-package hazard (two instances of the same module loaded
via different entry conditions).

## What to set

`package.json`:

```json
{
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "engines": { "node": ">=22.0.0" },
  "files": ["dist", "LICENSE", "README.md"]
}
```

- Drop any `require` condition in `exports` — declare ESM-only loudly.
- `engines.node` paired with `.npmrc` `engine-strict=true` catches
  consumers on too-old Node.
- The `files` allowlist keeps tests and source out of the tarball.

## Bin entries

```json
{ "bin": { "june15": "./dist/cli/bin.js" } }
```

The bin file must:

1. Start with `#!/usr/bin/env node`.
2. Be marked executable (`chmod +x`). Tsup preserves the shebang; the
   npm install hook chmods bin files automatically.

## Native-module ESM shim

ESM modules don't have `require`, `__dirname`, or `__filename`. Some
native deps (`node-pty`) still expect them. tsup `banner` recreates
them:

```ts
banner: () => ({
  js: [
    "import { createRequire as __createRequire } from 'node:module';",
    "import { fileURLToPath as __fileURLToPath } from 'node:url';",
    "import { dirname as __dirname_fn } from 'node:path';",
    'const require = __createRequire(import.meta.url);',
    'const __filename = __fileURLToPath(import.meta.url);',
    'const __dirname = __dirname_fn(__filename);',
  ].join('\n'),
})
```

## Where it shows up in june15

- `package.json` — full configuration.
- `tsup.config.ts` — banner shim.
- `src/cli/bin.ts` — JSON imports via `import pkg from '../../package.json' with { type: 'json' }`.
