import { describe, expect, it } from 'vitest';
import {
  installClaude,
  installOrThrow,
  type ConfirmPrompt,
  type InstallerLog,
  type SpawnFacade,
} from '../../../src/claude/installer.js';
import { isJune1815Error } from '../../../src/errors.js';

function recordingLog(): InstallerLog & { entries: string[] } {
  const entries: string[] = [];
  return {
    entries,
    info: (m) => entries.push(`info:${m}`),
    warn: (m) => entries.push(`warn:${m}`),
  };
}

function fakeSpawn(code: number, stderr = ''): SpawnFacade {
  return { run: () => Promise.resolve({ code, stderr }) };
}

function fakePrompt(answer: boolean): ConfirmPrompt {
  return { confirm: () => Promise.resolve(answer) };
}

describe('installClaude', () => {
  it('headless without autoInstall refuses', async () => {
    const log = recordingLog();
    const r = await installClaude({
      mode: 'headless',
      autoInstall: false,
      log,
      spawnFacade: fakeSpawn(0),
    });
    expect(r).toEqual({ installed: false, reason: 'headless_no_consent' });
    expect(log.entries.some((e) => e.startsWith('warn:'))).toBe(true);
  });

  it('headless with autoInstall runs the install', async () => {
    const r = await installClaude({
      mode: 'headless',
      autoInstall: true,
      spawnFacade: fakeSpawn(0),
    });
    expect(r.installed).toBe(true);
    if (r.installed) expect(r.command).toContain('@anthropic-ai/claude-code');
  });

  it('interactive declined returns declined', async () => {
    const r = await installClaude({
      mode: 'interactive',
      autoInstall: false,
      prompt: fakePrompt(false),
      spawnFacade: fakeSpawn(0),
    });
    expect(r).toEqual({ installed: false, reason: 'declined' });
  });

  it('interactive accepted runs the install', async () => {
    const r = await installClaude({
      mode: 'interactive',
      autoInstall: false,
      prompt: fakePrompt(true),
      spawnFacade: fakeSpawn(0),
    });
    expect(r.installed).toBe(true);
  });

  it('interactive with no prompt facility refuses', async () => {
    const r = await installClaude({
      mode: 'interactive',
      autoInstall: true,
      spawnFacade: fakeSpawn(0),
    });
    expect(r).toEqual({ installed: false, reason: 'declined' });
  });

  it('non-zero exit returns spawn_failed with stderr in details', async () => {
    const r = await installClaude({
      mode: 'headless',
      autoInstall: true,
      spawnFacade: fakeSpawn(1, 'EACCES: permission denied'),
    });
    expect(r).toMatchObject({ installed: false, reason: 'spawn_failed' });
    if (!r.installed && r.reason === 'spawn_failed') {
      expect(r.details).toContain('EACCES');
    }
  });

  it('uses a custom install command when provided', async () => {
    let captured: { cmd: string; args: readonly string[] } | null = null;
    const spawnFacade: SpawnFacade = {
      run: (cmd, args) => {
        captured = { cmd, args };
        return Promise.resolve({ code: 0, stderr: '' });
      },
    };
    await installClaude({
      mode: 'headless',
      autoInstall: true,
      spawnFacade,
      command: { cmd: 'bun', args: ['install', '-g', 'claude'] },
    });
    expect(captured).toEqual({ cmd: 'bun', args: ['install', '-g', 'claude'] });
  });
});

describe('installOrThrow', () => {
  it('returns silently on success', async () => {
    await expect(
      installOrThrow({
        mode: 'headless',
        autoInstall: true,
        spawnFacade: fakeSpawn(0),
      }),
    ).resolves.toBeUndefined();
  });

  it('throws claude_install_declined when user says no', async () => {
    try {
      await installOrThrow({
        mode: 'interactive',
        autoInstall: false,
        prompt: fakePrompt(false),
        spawnFacade: fakeSpawn(0),
      });
      expect.fail('expected throw');
    } catch (err) {
      expect(isJune1815Error(err)).toBe(true);
      if (isJune1815Error(err)) expect(err.code).toBe('claude_install_declined');
    }
  });

  it('throws claude_install_failed when spawn fails', async () => {
    try {
      await installOrThrow({
        mode: 'headless',
        autoInstall: true,
        spawnFacade: fakeSpawn(1, 'network unreachable'),
      });
      expect.fail('expected throw');
    } catch (err) {
      expect(isJune1815Error(err)).toBe(true);
      if (isJune1815Error(err)) {
        expect(err.code).toBe('claude_install_failed');
        expect(err.message).toContain('network unreachable');
      }
    }
  });
});
