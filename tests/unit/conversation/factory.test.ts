import { describe, expect, it } from 'vitest';
import { ProductionConversationFactory } from '../../../src/conversation/factory.js';
import type { PtyHandle, PtySpawner, PtySpawnOptions } from '../../../src/pty/claude-pty.js';

function fakeHandle(): PtyHandle {
  return {
    pid: 1234,
    onData: () => () => {},
    onExit: () => () => {},
    write: () => {},
    resize: () => {},
    kill: () => {},
  };
}

describe('ProductionConversationFactory', () => {
  it('forwards model / effort / append-system-prompt / resume / add-dir as CLI args', async () => {
    const captured: { value?: PtySpawnOptions } = {};
    const spawner: PtySpawner = {
      spawn: (opts) => {
        captured.value = opts;
        return fakeHandle();
      },
    };
    const factory = new ProductionConversationFactory({
      claudePath: '/usr/local/bin/claude',
      env: {},
      cols: 200,
      rows: 50,
      idleQuietMs: 10,
      spawner,
    });
    await factory.create({
      id: 'c-1',
      cwd: '/work',
      model: 'opus-4-7',
      effort: 'high',
      systemPromptAppend: 'be brief',
      resumeSessionId: 'sess-42',
    });
    expect(captured.value).toBeDefined();
    expect(captured.value?.command).toBe('/usr/local/bin/claude');
    expect(captured.value?.cwd).toBe('/work');
    const args = captured.value?.args ?? [];
    expect(args).toContain('--model');
    expect(args).toContain('opus-4-7');
    expect(args).toContain('--effort');
    expect(args).toContain('high');
    expect(args).toContain('--append-system-prompt');
    expect(args).toContain('be brief');
    expect(args).toContain('--resume');
    expect(args).toContain('sess-42');
    expect(args).toContain('--add-dir');
    expect(args).toContain('/work');
    expect(args).toContain('--permission-mode');
    expect(args).toContain('bypassPermissions');
  });

  it('omits optional flags when not supplied', async () => {
    const captured: { value?: PtySpawnOptions } = {};
    const spawner: PtySpawner = {
      spawn: (opts) => {
        captured.value = opts;
        return fakeHandle();
      },
    };
    const factory = new ProductionConversationFactory({
      claudePath: '/c',
      env: {},
      cols: 200,
      rows: 50,
      idleQuietMs: 10,
      spawner,
    });
    await factory.create({ id: 'c-1', cwd: '/x' });
    const args = captured.value?.args ?? [];
    expect(args).not.toContain('--model');
    expect(args).not.toContain('--effort');
    expect(args).not.toContain('--resume');
    expect(args).toContain('--add-dir');
  });

  it('returns a Conversation in starting state', async () => {
    const factory = new ProductionConversationFactory({
      claudePath: '/c',
      env: {},
      cols: 200,
      rows: 50,
      idleQuietMs: 10,
      spawner: { spawn: () => fakeHandle() },
    });
    const conv = await factory.create({ id: 'c-1', cwd: '/x' });
    expect(conv.id).toBe('c-1');
    expect(conv.cwd).toBe('/x');
    expect(conv.state).toBe('starting');
  });
});
