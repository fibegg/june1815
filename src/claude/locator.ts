import {
  accessSync,
  constants as fsConstants,
  existsSync,
  readdirSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { delimiter, join } from 'node:path';

export type LocatorSource = 'override' | 'path' | 'nvm' | 'npm-bin' | 'system';

export type LocatorResult =
  | { readonly found: true; readonly path: string; readonly source: LocatorSource }
  | { readonly found: false; readonly searched: readonly string[] };

export interface LocatorFs {
  existsSync(path: string): boolean;
  isExecutable(path: string): boolean;
  readdirSync(path: string): string[];
}

export interface LocatorInput {
  /** Explicit override (from JUNE1815_CLAUDE_PATH or config.claude.path). */
  overridePath?: string | undefined;
  /** The value of $PATH. */
  pathVar?: string | undefined;
  /** User home directory. */
  home?: string;
  /** Platform — `process.platform` by default. */
  platform?: NodeJS.Platform;
  /** Filesystem facade — real fs by default. */
  fs?: LocatorFs;
  /** Binary name to look for. Defaults to `claude` (or `claude.exe` on win32). */
  binaryName?: string;
}

const realFs: LocatorFs = {
  existsSync,
  isExecutable: (p) => {
    try {
      accessSync(p, fsConstants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
  readdirSync,
};

const SYSTEM_BIN_DIRS: readonly string[] = Object.freeze([
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
]);

/** Sort descending so newest Node version comes first. */
function semverCompareDesc(a: string, b: string): number {
  const ap = a.replace(/^v/, '').split('.').map(Number);
  const bp = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(ap.length, bp.length); i += 1) {
    const diff = (bp[i] ?? 0) - (ap[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function findNvmBinDirs(home: string, fs: LocatorFs): string[] {
  const nvmDir = join(home, '.nvm', 'versions', 'node');
  if (!fs.existsSync(nvmDir)) return [];
  let entries: string[];
  try {
    entries = fs.readdirSync(nvmDir);
  } catch {
    return [];
  }
  return entries
    .filter((e) => /^v\d+/.test(e))
    .sort(semverCompareDesc)
    .map((e) => join(nvmDir, e, 'bin'));
}

/**
 * Resolve a path to the `claude` executable, walking a prioritized search:
 *   1. explicit override (JUNE1815_CLAUDE_PATH / config.claude.path)
 *   2. every directory on $PATH
 *   3. nvm bin directories (newest Node version first)
 *   4. ~/.npm/bin (npm global prefix default)
 *   5. system-wide locations: /opt/homebrew/bin, /usr/local/bin, /usr/bin, /bin
 *
 * Returns the first existing, executable candidate.
 */
export function locateClaude(input: LocatorInput = {}): LocatorResult {
  const fs = input.fs ?? realFs;
  const home = input.home ?? homedir();
  const plat = input.platform ?? platform();
  const binaryName = input.binaryName ?? (plat === 'win32' ? 'claude.exe' : 'claude');
  const pathSep = plat === 'win32' ? ';' : delimiter;

  const searched: string[] = [];
  const candidates: { path: string; source: LocatorSource }[] = [];

  if (input.overridePath && input.overridePath.trim().length > 0) {
    candidates.push({ path: input.overridePath, source: 'override' });
  }

  const pathVar = input.pathVar ?? '';
  if (pathVar.length > 0) {
    for (const dir of pathVar.split(pathSep)) {
      const trimmed = dir.trim();
      if (trimmed.length === 0) continue;
      candidates.push({ path: join(trimmed, binaryName), source: 'path' });
    }
  }

  for (const nvmBin of findNvmBinDirs(home, fs)) {
    candidates.push({ path: join(nvmBin, binaryName), source: 'nvm' });
  }

  candidates.push({ path: join(home, '.npm', 'bin', binaryName), source: 'npm-bin' });

  for (const sysDir of SYSTEM_BIN_DIRS) {
    candidates.push({ path: join(sysDir, binaryName), source: 'system' });
  }

  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.path)) continue;
    seen.add(c.path);
    searched.push(c.path);
    if (fs.existsSync(c.path) && fs.isExecutable(c.path)) {
      return { found: true, path: c.path, source: c.source };
    }
  }

  return { found: false, searched };
}

/**
 * An enriched $PATH suitable for spawning child processes that may need to
 * find `claude` themselves (e.g. when running under a stripped login shell).
 * Adds the nvm bin dirs and the npm global bin to the front of the existing
 * PATH so the child shell sees them first.
 */
export function enrichedPath(input: LocatorInput = {}): string {
  const fs = input.fs ?? realFs;
  const home = input.home ?? homedir();
  const plat = input.platform ?? platform();
  const sep = plat === 'win32' ? ';' : delimiter;
  const original = input.pathVar ?? '';

  const extra: string[] = [];
  extra.push(...findNvmBinDirs(home, fs));
  extra.push(join(home, '.npm', 'bin'));
  for (const dir of SYSTEM_BIN_DIRS) extra.push(dir);

  const seen = new Set<string>();
  const parts = [...extra, ...original.split(sep)].filter((p) => {
    if (p.length === 0) return false;
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });

  return parts.join(sep);
}
