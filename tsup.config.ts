import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/bin': 'src/cli/bin.ts',
    'server/events': 'src/server/events.ts',
  },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  dts: true,
  sourcemap: true,
  splitting: false,
  clean: true,
  shims: false,
  treeshake: true,
  banner: ({ format }) => {
    if (format !== 'esm') return {};
    // Restores __dirname / __filename / require() for ESM modules that need them
    // (e.g. node-pty's helper-binary path resolution).
    return {
      js: [
        "import { createRequire as __createRequire } from 'node:module';",
        "import { fileURLToPath as __fileURLToPath } from 'node:url';",
        "import { dirname as __dirname_fn } from 'node:path';",
        'const require = __createRequire(import.meta.url);',
        'const __filename = __fileURLToPath(import.meta.url);',
        'const __dirname = __dirname_fn(__filename);',
      ].join('\n'),
    };
  },
  esbuildOptions(options) {
    options.conditions = ['node'];
  },
});
