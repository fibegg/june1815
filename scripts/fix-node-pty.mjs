#!/usr/bin/env node
/**
 * node-pty ships prebuilt binaries under `prebuilds/<platform>-<arch>/`,
 * but on some npm versions the file mode bits don't survive extraction —
 * the `spawn-helper` companion ends up as 0644, and any `pty.spawn(...)`
 * call then fails with `posix_spawnp failed.` at runtime.
 *
 * Run this as a `postinstall` step to restore the execute bit. Safe to
 * re-run; idempotent; silent when there's nothing to fix.
 */
import { chmodSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const TARGETS = [
  ['prebuilds', 'darwin-x64', 'spawn-helper'],
  ['prebuilds', 'darwin-arm64', 'spawn-helper'],
  ['prebuilds', 'linux-x64', 'spawn-helper'],
  ['prebuilds', 'linux-arm64', 'spawn-helper'],
];

let fixed = 0;
for (const parts of TARGETS) {
  const p = join(root, 'node_modules', 'node-pty', ...parts);
  if (!existsSync(p)) continue;
  const mode = statSync(p).mode & 0o777;
  if ((mode & 0o111) === 0o111) continue;
  chmodSync(p, mode | 0o755);
  fixed += 1;
  console.error(`fixed-node-pty: chmod +x ${p}`);
}
if (fixed > 0) console.error(`fixed-node-pty: ${fixed} file(s) updated`);
