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
  it('reports `none` when no source is present', async () => {
    const svc = new AuthService({ dataDir: '/d', homeDir: '/h', env: {}, fs: inMemoryFs() });
    const s = await svc.status();
    expect(s.authenticated).toBe(false);
    expect(s.source).toBe('none');
  });

  it('reports the env oauth source (local, no probe needed)', async () => {
    const svc = new AuthService({
      dataDir: '/d',
      homeDir: '/h',
      env: { CLAUDE_CODE_OAUTH_TOKEN: 'tok' },
      fs: inMemoryFs(),
    });
    const s = await svc.status();
    expect(s.source).toBe('env_oauth');
  });

  it('statusLocal is synchronous and skips the probe', () => {
    const svc = new AuthService({
      dataDir: '/d',
      homeDir: '/h',
      env: { CLAUDE_CODE_OAUTH_TOKEN: 'tok' },
      fs: inMemoryFs(),
    });
    expect(svc.statusLocal().source).toBe('env_oauth');
  });

  it('falls back to `claude auth status` when no local source resolves', async () => {
    const svc = new AuthService({
      dataDir: '/d',
      homeDir: '/h',
      env: {},
      fs: inMemoryFs(),
      claudePath: '/usr/local/bin/claude',
      probeSpawn: {
        run: () =>
          Promise.resolve({
            code: 0,
            stdout: JSON.stringify({
              loggedIn: true,
              authMethod: 'claude.ai',
              email: 'you@example.com',
              subscriptionType: 'max',
            }),
            stderr: '',
          }),
      },
    });
    const s = await svc.status();
    expect(s.authenticated).toBe(true);
    expect(s.source).toBe('claude_cli_session');
    expect(s.identity?.email).toBe('you@example.com');
    expect(s.identity?.subscriptionType).toBe('max');
  });

  it('falls back gracefully when probe says not logged in', async () => {
    const svc = new AuthService({
      dataDir: '/d',
      homeDir: '/h',
      env: {},
      fs: inMemoryFs(),
      claudePath: '/usr/local/bin/claude',
      probeSpawn: {
        run: () =>
          Promise.resolve({
            code: 0,
            stdout: JSON.stringify({ loggedIn: false }),
            stderr: '',
          }),
      },
    });
    const s = await svc.status();
    expect(s.authenticated).toBe(false);
    expect(s.source).toBe('none');
  });

  it('falls back gracefully when probe spawn fails', async () => {
    const svc = new AuthService({
      dataDir: '/d',
      homeDir: '/h',
      env: {},
      fs: inMemoryFs(),
      claudePath: '/usr/local/bin/claude',
      probeSpawn: {
        run: () => Promise.resolve({ code: 127, stdout: '', stderr: 'not found' }),
      },
    });
    const s = await svc.status();
    expect(s.authenticated).toBe(false);
  });

  it('caches probe results across consecutive calls', async () => {
    let calls = 0;
    const svc = new AuthService({
      dataDir: '/d',
      homeDir: '/h',
      env: {},
      fs: inMemoryFs(),
      claudePath: '/usr/local/bin/claude',
      probeSpawn: {
        run: () => {
          calls += 1;
          return Promise.resolve({
            code: 0,
            stdout: JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' }),
            stderr: '',
          });
        },
      },
    });
    await svc.status();
    await svc.status();
    expect(calls).toBe(1);
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
    expect(() => { svc.clear(); }).not.toThrow();
  });

  it('after setToken, status reports june15_token_file', async () => {
    const fs = inMemoryFs();
    const svc = new AuthService({ dataDir: '/d', homeDir: '/h', env: {}, fs });
    svc.setToken('my-token');
    const s = await svc.status();
    expect(s.source).toBe('june15_token_file');
  });
});
