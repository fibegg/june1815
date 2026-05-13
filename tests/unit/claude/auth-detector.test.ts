import { describe, expect, it } from 'vitest';
import { detectAuth, type AuthDetectorFs } from '../../../src/claude/auth-detector.js';

function fakeFs(files: Record<string, string>): AuthDetectorFs {
  return {
    existsSync: (p) => p in files,
    readFileSync: (p) => {
      const f = files[p];
      if (f === undefined) throw new Error(`ENOENT: ${p}`);
      return f;
    },
  };
}

describe('detectAuth', () => {
  it('returns none when no source is present', () => {
    const r = detectAuth({ env: {}, homeDir: '/h', dataDir: '/d', fs: fakeFs({}) });
    expect(r).toEqual({ authenticated: false, source: 'none' });
  });

  it('prefers CLAUDE_CODE_OAUTH_TOKEN over anything else', () => {
    const r = detectAuth({
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: 'abc',
        ANTHROPIC_API_KEY: 'def',
        CLAUDE_API_KEY: 'ghi',
      },
      homeDir: '/h',
      dataDir: '/d',
      fs: fakeFs({
        '/d/agent_token.txt': 'jkl',
        '/h/.claude/.credentials.json': '{}',
      }),
    });
    expect(r.authenticated).toBe(true);
    expect(r.source).toBe('env_oauth');
    expect(r.envKey).toBe('CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('falls back to ANTHROPIC_API_KEY when no OAuth token', () => {
    const r = detectAuth({
      env: { ANTHROPIC_API_KEY: 'a' },
      homeDir: '/h',
      dataDir: '/d',
      fs: fakeFs({}),
    });
    expect(r.source).toBe('env_anthropic_key');
  });

  it('falls back to CLAUDE_API_KEY before files', () => {
    const r = detectAuth({
      env: { CLAUDE_API_KEY: 'c' },
      homeDir: '/h',
      dataDir: '/d',
      fs: fakeFs({ '/d/agent_token.txt': 'x' }),
    });
    expect(r.source).toBe('env_claude_key');
  });

  it('reads june15 token file when env is empty', () => {
    const r = detectAuth({
      env: {},
      homeDir: '/h',
      dataDir: '/d',
      fs: fakeFs({ '/d/agent_token.txt': 'token-value' }),
    });
    expect(r.source).toBe('june15_token_file');
    expect(r.path).toBe('/d/agent_token.txt');
  });

  it('treats a blank token file as unauthenticated for that source', () => {
    const r = detectAuth({
      env: {},
      homeDir: '/h',
      dataDir: '/d',
      fs: fakeFs({ '/d/agent_token.txt': '   \n  ' }),
    });
    expect(r.source).toBe('none');
  });

  it('falls through to ~/.claude/.credentials.json', () => {
    const r = detectAuth({
      env: {},
      homeDir: '/h',
      dataDir: '/d',
      fs: fakeFs({ '/h/.claude/.credentials.json': '{ "x": 1 }' }),
    });
    expect(r.source).toBe('claude_credentials');
    expect(r.path).toBe('/h/.claude/.credentials.json');
  });

  it('ignores blank env values', () => {
    const r = detectAuth({
      env: { ANTHROPIC_API_KEY: '   ' },
      homeDir: '/h',
      dataDir: '/d',
      fs: fakeFs({}),
    });
    expect(r.source).toBe('none');
  });

  it('does not return the token value, only the source', () => {
    const r = detectAuth({
      env: { CLAUDE_CODE_OAUTH_TOKEN: 'super-secret-token' },
      homeDir: '/h',
      dataDir: '/d',
      fs: fakeFs({}),
    });
    expect(JSON.stringify(r)).not.toContain('super-secret-token');
  });
});
