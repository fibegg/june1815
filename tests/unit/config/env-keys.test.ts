import { describe, expect, it } from 'vitest';
import { ENV_KEYS, findEnvKey } from '../../../src/config/env-keys.js';

describe('ENV_KEYS catalogue', () => {
  it('exposes at least the minimum required leaves', () => {
    const envNames = ENV_KEYS.map((k) => k.env);
    expect(envNames).toContain('JUNE15_PORT');
    expect(envNames).toContain('JUNE15_HOST');
    expect(envNames).toContain('JUNE15_BEARER_TOKEN');
    expect(envNames).toContain('JUNE15_MODE');
    expect(envNames).toContain('JUNE15_AUTO_INSTALL');
  });

  it('every env name uses the JUNE15_ prefix', () => {
    for (const k of ENV_KEYS) {
      expect(k.env).toMatch(/^JUNE15_[A-Z][A-Z0-9_]*$/);
    }
  });

  it('every yaml path is dot-separated lower camel', () => {
    for (const k of ENV_KEYS) {
      expect(k.yaml).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/);
    }
  });

  it('no duplicate env names or yaml paths', () => {
    const envs = new Set<string>();
    const yamls = new Set<string>();
    for (const k of ENV_KEYS) {
      expect(envs.has(k.env)).toBe(false);
      expect(yamls.has(k.yaml)).toBe(false);
      envs.add(k.env);
      yamls.add(k.yaml);
    }
  });

  it('marks the bearer token as secret', () => {
    const tok = findEnvKey('JUNE15_BEARER_TOKEN');
    expect(tok?.secret).toBe(true);
  });

  it('returns undefined for unknown env names', () => {
    expect(findEnvKey('NOT_A_KEY')).toBeUndefined();
  });
});
