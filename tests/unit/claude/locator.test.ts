import { describe, expect, it } from 'vitest';
import { enrichedPath, locateClaude, type LocatorFs } from '../../../src/claude/locator.js';

function fakeFs(opts: {
  files?: Set<string>;
  executables?: Set<string>;
  dirs?: Record<string, string[]>;
}): LocatorFs {
  const files = opts.files ?? new Set<string>();
  const exec = opts.executables ?? files;
  const dirs = opts.dirs ?? {};
  return {
    existsSync: (p) => files.has(p) || p in dirs,
    isExecutable: (p) => exec.has(p),
    readdirSync: (p) => dirs[p] ?? [],
  };
}

describe('locateClaude', () => {
  it('prefers an explicit override', () => {
    const fs = fakeFs({
      files: new Set(['/custom/path/claude', '/usr/local/bin/claude']),
    });
    const r = locateClaude({
      overridePath: '/custom/path/claude',
      pathVar: '/usr/local/bin',
      home: '/home/u',
      platform: 'linux',
      fs,
    });
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.path).toBe('/custom/path/claude');
      expect(r.source).toBe('override');
    }
  });

  it('falls back to $PATH when override is missing on disk', () => {
    const fs = fakeFs({
      files: new Set(['/usr/local/bin/claude']),
    });
    const r = locateClaude({
      overridePath: '/nope/claude',
      pathVar: '/usr/local/bin',
      home: '/home/u',
      platform: 'linux',
      fs,
    });
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.path).toBe('/usr/local/bin/claude');
      expect(r.source).toBe('path');
    }
  });

  it('searches nvm bin dirs newest version first', () => {
    const fs = fakeFs({
      files: new Set(['/home/u/.nvm/versions/node/v22.5.0/bin/claude']),
      dirs: {
        '/home/u/.nvm/versions/node': ['v18.20.0', 'v22.5.0', 'v20.10.0'],
      },
    });
    const r = locateClaude({
      home: '/home/u',
      platform: 'linux',
      fs,
    });
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.path).toBe('/home/u/.nvm/versions/node/v22.5.0/bin/claude');
      expect(r.source).toBe('nvm');
    }
  });

  it('finds claude under ~/.npm/bin', () => {
    const fs = fakeFs({
      files: new Set(['/home/u/.npm/bin/claude']),
    });
    const r = locateClaude({ home: '/home/u', platform: 'linux', fs });
    expect(r.found).toBe(true);
    if (r.found) expect(r.source).toBe('npm-bin');
  });

  it('finds claude in /opt/homebrew/bin on darwin', () => {
    const fs = fakeFs({
      files: new Set(['/opt/homebrew/bin/claude']),
    });
    const r = locateClaude({ home: '/Users/u', platform: 'darwin', fs });
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.path).toBe('/opt/homebrew/bin/claude');
      expect(r.source).toBe('system');
    }
  });

  it('returns not found with the search trail when missing everywhere', () => {
    const fs = fakeFs({ files: new Set() });
    const r = locateClaude({
      pathVar: '/usr/local/bin:/usr/bin',
      home: '/home/u',
      platform: 'linux',
      fs,
    });
    expect(r.found).toBe(false);
    if (!r.found) {
      expect(r.searched).toContain('/usr/local/bin/claude');
      expect(r.searched).toContain('/usr/bin/claude');
      expect(r.searched).toContain('/home/u/.npm/bin/claude');
      expect(r.searched).toContain('/opt/homebrew/bin/claude');
    }
  });

  it('uses claude.exe on win32', () => {
    const fs = fakeFs({ files: new Set(['C:\\bin\\claude.exe']) });
    const r = locateClaude({
      pathVar: 'C:\\bin',
      home: 'C:\\Users\\u',
      platform: 'win32',
      fs,
    });
    expect(r.found).toBe(true);
    if (r.found) expect(r.path).toContain('claude.exe');
  });
});

describe('enrichedPath', () => {
  it('prepends nvm + npm + system bins to the original path', () => {
    const fs = fakeFs({
      dirs: { '/home/u/.nvm/versions/node': ['v22.5.0'] },
    });
    const out = enrichedPath({
      home: '/home/u',
      platform: 'linux',
      pathVar: '/usr/local/bin:/usr/bin',
      fs,
    });
    expect(out).toContain('/home/u/.nvm/versions/node/v22.5.0/bin');
    expect(out).toContain('/home/u/.npm/bin');
    expect(out).toContain('/opt/homebrew/bin');
    expect(out).toContain('/usr/local/bin');
  });

  it('deduplicates repeated entries', () => {
    const fs = fakeFs({});
    const out = enrichedPath({
      home: '/home/u',
      platform: 'linux',
      pathVar: '/usr/local/bin:/usr/bin:/usr/local/bin',
      fs,
    });
    const parts = out.split(':');
    const uniques = new Set(parts);
    expect(parts.length).toBe(uniques.size);
  });
});
