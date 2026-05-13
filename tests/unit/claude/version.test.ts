import { describe, expect, it } from 'vitest';
import {
  getClaudeVersion,
  parseClaudeVersion,
  type VersionSpawnFacade,
} from '../../../src/claude/version.js';

function fakeSpawn(stdout: string, stderr = '', code = 0): VersionSpawnFacade {
  return { run: () => Promise.resolve({ code, stdout, stderr }) };
}

describe('parseClaudeVersion', () => {
  it('extracts semver from a plain output', () => {
    const v = parseClaudeVersion('claude 1.2.3 (Claude Code)\n');
    expect(v.semver).toBe('1.2.3');
    expect(v.parts).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('strips ANSI escape sequences before matching', () => {
    const v = parseClaudeVersion('\x1b[32mclaude 4.5.6\x1b[0m');
    expect(v.semver).toBe('4.5.6');
  });

  it('returns nulls when no semver is present', () => {
    const v = parseClaudeVersion('something else entirely');
    expect(v.semver).toBeNull();
    expect(v.parts).toBeNull();
  });

  it('ignores prerelease suffixes when reporting parts', () => {
    const v = parseClaudeVersion('1.0.0-alpha.2');
    expect(v.parts).toEqual({ major: 1, minor: 0, patch: 0 });
    expect(v.semver).toBe('1.0.0');
  });

  it('keeps the raw cleaned output', () => {
    const v = parseClaudeVersion('  claude 9.10.11  \n');
    expect(v.raw).toBe('claude 9.10.11');
  });
});

describe('getClaudeVersion', () => {
  it('spawns and parses successful output', async () => {
    const v = await getClaudeVersion('/usr/local/bin/claude', fakeSpawn('claude 2.3.4'));
    expect(v.semver).toBe('2.3.4');
  });

  it('returns nulls on non-zero exit', async () => {
    const v = await getClaudeVersion(
      '/usr/local/bin/claude',
      fakeSpawn('', 'ENOENT', 127),
    );
    expect(v.semver).toBeNull();
    expect(v.raw).toContain('ENOENT');
  });

  it('returns nulls on spawn error (code -1)', async () => {
    const v = await getClaudeVersion(
      '/usr/local/bin/claude',
      fakeSpawn('', 'spawn error', -1),
    );
    expect(v.semver).toBeNull();
  });
});
