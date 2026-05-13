import { describe, expect, it } from 'vitest';
import { AuthService, type TokenStoreFs } from '../../../src/server/auth-service.js';
import type { AuthDetectorFs } from '../../../src/claude/auth-detector.js';

function inMemoryFs(initial: Record<string, string> = {}): TokenStoreFs & AuthDetectorFs & {
  files: Record<string, string>;
} {
  const files: Record<string, string> = { ...initial };
  return {
    files,
    existsSync: (p) => p in files,
    readFileSync: (p) => {
      const f = files[p];
      if (f === undefined) throw new Error(`ENOENT: ${p}`);
      return f;
    },
    writeFileSync: (p, d) => {
      files[p] = d;
    },
    rmSync: (p) => {
      delete files[p];
    },
    mkdirSync: () => {},
  };
}

describe('AuthService.status', () => {
  it('reports `none` when no source is present', () => {
    const svc = new AuthService({ dataDir: '/d', homeDir: '/h', env: {}, fs: inMemoryFs() });
    const s = svc.status();
    expect(s.authenticated).toBe(false);
    expect(s.source).toBe('none');
  });

  it('reports the env oauth source', () => {
    const svc = new AuthService({
      dataDir: '/d',
      homeDir: '/h',
      env: { CLAUDE_CODE_OAUTH_TOKEN: 'tok' },
      fs: inMemoryFs(),
    });
    expect(svc.status().source).toBe('env_oauth');
  });
});

describe('AuthService.setToken / clear', () => {
  it('writes the token file under dataDir', () => {
    const fs = inMemoryFs();
    const svc = new AuthService({ dataDir: '/d', homeDir: '/h', env: {}, fs });
    svc.setToken('my-token');
    expect(fs.files['/d/agent_token.txt']).toBe('my-token');
  });

  it('trims whitespace on write', () => {
    const fs = inMemoryFs();
    const svc = new AuthService({ dataDir: '/d', homeDir: '/h', env: {}, fs });
    svc.setToken('  my-token \n');
    expect(fs.files['/d/agent_token.txt']).toBe('my-token');
  });

  it('clear removes the token file', () => {
    const fs = inMemoryFs();
    const svc = new AuthService({ dataDir: '/d', homeDir: '/h', env: {}, fs });
    svc.setToken('my-token');
    svc.clear();
    expect(fs.files['/d/agent_token.txt']).toBeUndefined();
  });

  it('clear is a no-op when no file exists', () => {
    const svc = new AuthService({ dataDir: '/d', homeDir: '/h', env: {}, fs: inMemoryFs() });
    expect(() => svc.clear()).not.toThrow();
  });

  it('after setToken, status reports june15_token_file', () => {
    const fs = inMemoryFs();
    const svc = new AuthService({ dataDir: '/d', homeDir: '/h', env: {}, fs });
    svc.setToken('my-token');
    expect(svc.status().source).toBe('june15_token_file');
  });
});
