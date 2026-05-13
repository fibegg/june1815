import { describe, expect, it } from 'vitest';
import { deepMerge, envToPartial, loadConfig, type FsFacade } from '../../../src/config/loader.js';
import { isJune15Error } from '../../../src/errors.js';

function emptyFs(): FsFacade {
  return {
    existsSync: () => false,
    readFileSync: () => {
      throw new Error('no files');
    },
  };
}

function fsWith(files: Record<string, string>): FsFacade {
  return {
    existsSync: (path) => path in files,
    readFileSync: (path) => {
      const f = files[path];
      if (f === undefined) throw new Error(`ENOENT: ${path}`);
      return f;
    },
  };
}

describe('deepMerge', () => {
  it('replaces leaves with the override', () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it('preserves base keys not in override', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it('recurses into nested objects', () => {
    expect(deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 9 } })).toEqual({ a: { x: 1, y: 9 } });
  });

  it('does not mutate inputs', () => {
    const base = { a: { x: 1 } };
    const over = { a: { y: 2 } };
    deepMerge(base, over);
    expect(base).toEqual({ a: { x: 1 } });
    expect(over).toEqual({ a: { y: 2 } });
  });

  it('arrays are replaced, not concatenated', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
  });
});

describe('envToPartial', () => {
  it('skips undefined env vars', () => {
    expect(envToPartial({})).toEqual({});
  });

  it('coerces numbers and booleans', () => {
    const out = envToPartial({
      JUNE15_PORT: '8080',
      JUNE15_AUTO_INSTALL: 'true',
      JUNE15_HOST: '0.0.0.0',
    });
    expect(out).toEqual({
      server: { port: 8080, host: '0.0.0.0' },
      claude: { autoInstall: true },
    });
  });

  it('accepts varied boolean spellings', () => {
    expect(envToPartial({ JUNE15_AUTO_INSTALL: '1' })).toEqual({ claude: { autoInstall: true } });
    expect(envToPartial({ JUNE15_AUTO_INSTALL: 'yes' })).toEqual({ claude: { autoInstall: true } });
    expect(envToPartial({ JUNE15_AUTO_INSTALL: 'off' })).toEqual({ claude: { autoInstall: false } });
  });

  it('ignores blank values', () => {
    expect(envToPartial({ JUNE15_PORT: '' })).toEqual({});
    expect(envToPartial({ JUNE15_PORT: '   ' })).toEqual({});
  });
});

describe('loadConfig priority', () => {
  it('returns defaults when nothing is provided', () => {
    const c = loadConfig({ env: {}, cwd: '/x', homeDir: '/h', fs: emptyFs() });
    expect(c.server.port).toBe(7150);
    expect(c.server.host).toBe('127.0.0.1');
    expect(c.claude.autoInstall).toBe(false);
  });

  it('CLI overrides win over ENV', () => {
    const c = loadConfig({
      env: { JUNE15_PORT: '9000' },
      cwd: '/x',
      homeDir: '/h',
      fs: emptyFs(),
      cliOverrides: { server: { port: 9999 } },
    });
    expect(c.server.port).toBe(9999);
  });

  it('ENV overrides project yaml', () => {
    const fs = fsWith({ '/x/june15.yml': 'server:\n  port: 3000\n' });
    const c = loadConfig({
      env: { JUNE15_PORT: '5000' },
      cwd: '/x',
      homeDir: '/h',
      fs,
    });
    expect(c.server.port).toBe(5000);
  });

  it('project yaml overrides user yaml', () => {
    const fs = fsWith({
      '/x/june15.yml': 'server:\n  port: 3000\n',
      '/h/.config/june15/june15.yml': 'server:\n  port: 1234\n',
    });
    const c = loadConfig({ env: {}, cwd: '/x', homeDir: '/h', fs });
    expect(c.server.port).toBe(3000);
  });

  it('user yaml beats defaults', () => {
    const fs = fsWith({ '/h/.config/june15/june15.yml': 'server:\n  port: 4567\n' });
    const c = loadConfig({ env: {}, cwd: '/x', homeDir: '/h', fs });
    expect(c.server.port).toBe(4567);
  });

  it('throws June15Error config_invalid on out-of-range port', () => {
    try {
      loadConfig({
        env: { JUNE15_PORT: '999999' },
        cwd: '/x',
        homeDir: '/h',
        fs: emptyFs(),
      });
      expect.fail('expected throw');
    } catch (err) {
      expect(isJune15Error(err)).toBe(true);
      if (isJune15Error(err)) expect(err.code).toBe('config_invalid');
    }
  });

  it('honors an explicit configPath over ./june15.yml', () => {
    const fs = fsWith({
      '/x/june15.yml': 'server:\n  port: 3000\n',
      '/x/custom.yml': 'server:\n  port: 4444\n',
    });
    const c = loadConfig({ env: {}, cwd: '/x', homeDir: '/h', fs, configPath: '/x/custom.yml' });
    expect(c.server.port).toBe(4444);
  });

  it('throws config_yaml_parse on malformed YAML', () => {
    const fs = fsWith({ '/x/june15.yml': '\t- this: : is invalid\n' });
    try {
      loadConfig({ env: {}, cwd: '/x', homeDir: '/h', fs });
      expect.fail('expected throw');
    } catch (err) {
      expect(isJune15Error(err)).toBe(true);
      if (isJune15Error(err)) expect(err.code).toBe('config_yaml_parse');
    }
  });
});
