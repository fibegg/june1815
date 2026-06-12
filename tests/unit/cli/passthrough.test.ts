import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isJune1815Command,
  passthroughToClaude,
  resolveWrappedClaude,
} from '../../../src/cli/passthrough.js';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function executable(name: string, source: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'june1815-passthrough-test-'));
  tmpDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, source);
  chmodSync(path, 0o755);
  return path;
}

describe('isJune1815Command', () => {
  it('keeps june1815 commands and flag-only invocations local', () => {
    expect(isJune1815Command([])).toBe(true);
    expect(isJune1815Command(['--version'])).toBe(true);
    expect(isJune1815Command(['gogogo', '--port', '7150'])).toBe(true);
    expect(isJune1815Command(['doctor'])).toBe(true);
    expect(isJune1815Command(['config', 'show'])).toBe(true);
  });

  it('passes through claude subcommands that june1815 does not own', () => {
    expect(isJune1815Command(['auth', 'status'])).toBe(false);
    expect(isJune1815Command(['mcp', 'list'])).toBe(false);
    expect(isJune1815Command(['update'])).toBe(false);
  });
});

describe('resolveWrappedClaude', () => {
  it('prefers JUNE1815_CLAUDE_PATH when it exists', () => {
    const fakeClaude = executable('real-claude', '#!/bin/sh\nexit 0\n');
    expect(resolveWrappedClaude({ JUNE1815_CLAUDE_PATH: fakeClaude, PATH: '' })).toBe(fakeClaude);
  });

  it('falls back to claude on PATH', () => {
    const fakeClaude = executable('claude', '#!/bin/sh\nexit 0\n');
    expect(resolveWrappedClaude({ PATH: join(fakeClaude, '..') })).toBe(fakeClaude);
  });
});

describe('passthroughToClaude', () => {
  it('returns the real claude exit code', async () => {
    const fakeClaude = executable(
      'claude',
      '#!/bin/sh\n[ "$1" = "auth" ] && [ "$2" = "status" ] && exit 7\nexit 0\n',
    );

    await expect(passthroughToClaude(['auth', 'status'], { JUNE1815_CLAUDE_PATH: fakeClaude })).resolves.toBe(7);
  });
});
