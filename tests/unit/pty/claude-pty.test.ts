import { describe, expect, it, vi } from 'vitest';
import { ClaudePty, type PtyExit, type PtyHandle, type PtySpawner } from '../../../src/pty/claude-pty.js';
import { isJune1815Error } from '../../../src/errors.js';

function fakeHandle(): {
  handle: PtyHandle;
  emitData(d: string): void;
  emitExit(info: PtyExit): void;
  writes: string[];
  killed: string[];
  resizes: [number, number][];
} {
  let dataListeners: ((d: string) => void)[] = [];
  let exitListeners: ((i: PtyExit) => void)[] = [];
  const writes: string[] = [];
  const killed: string[] = [];
  const resizes: [number, number][] = [];
  const handle: PtyHandle = {
    pid: 4242,
    onData: (l) => {
      dataListeners.push(l);
      return () => {
        dataListeners = dataListeners.filter((x) => x !== l);
      };
    },
    onExit: (l) => {
      exitListeners.push(l);
      return () => {
        exitListeners = exitListeners.filter((x) => x !== l);
      };
    },
    write: (d) => writes.push(d),
    resize: (c, r) => resizes.push([c, r]),
    kill: (sig) => killed.push(sig ?? 'SIGTERM'),
  };
  return {
    handle,
    emitData: (d) => { dataListeners.forEach((l) => { l(d); }); },
    emitExit: (i) => { exitListeners.forEach((l) => { l(i); }); },
    writes,
    killed,
    resizes,
  };
}

function fakeSpawner(handle: PtyHandle): PtySpawner {
  return { spawn: () => handle };
}

describe('ClaudePty', () => {
  it('starts in alive state with the handle pid', () => {
    const f = fakeHandle();
    const pty = ClaudePty.start(
      { command: 'claude', cwd: '/x', env: {}, cols: 200, rows: 50 },
      fakeSpawner(f.handle),
    );
    expect(pty.state).toBe('alive');
    expect(pty.pid).toBe(4242);
  });

  it('fans out data to multiple listeners', () => {
    const f = fakeHandle();
    const pty = ClaudePty.start(
      { command: 'claude', cwd: '/x', env: {}, cols: 200, rows: 50 },
      fakeSpawner(f.handle),
    );
    const a = vi.fn();
    const b = vi.fn();
    pty.onData(a);
    pty.onData(b);
    f.emitData('hello');
    expect(a).toHaveBeenCalledWith('hello');
    expect(b).toHaveBeenCalledWith('hello');
  });

  it('unsubscribes data listeners', () => {
    const f = fakeHandle();
    const pty = ClaudePty.start(
      { command: 'claude', cwd: '/x', env: {}, cols: 200, rows: 50 },
      fakeSpawner(f.handle),
    );
    const a = vi.fn();
    const off = pty.onData(a);
    off();
    f.emitData('x');
    expect(a).not.toHaveBeenCalled();
  });

  it('transitions to exited and fires exit listeners', () => {
    const f = fakeHandle();
    const pty = ClaudePty.start(
      { command: 'claude', cwd: '/x', env: {}, cols: 200, rows: 50 },
      fakeSpawner(f.handle),
    );
    const onExit = vi.fn();
    pty.onExit(onExit);
    f.emitExit({ exitCode: 0, signal: null });
    expect(pty.state).toBe('exited');
    expect(onExit).toHaveBeenCalledWith({ exitCode: 0, signal: null });
  });

  it('write/resize after exit throws pty_dead', () => {
    const f = fakeHandle();
    const pty = ClaudePty.start(
      { command: 'claude', cwd: '/x', env: {}, cols: 200, rows: 50 },
      fakeSpawner(f.handle),
    );
    f.emitExit({ exitCode: 1, signal: null });
    try {
      pty.write('hi');
      expect.fail('expected throw');
    } catch (err) {
      expect(isJune1815Error(err)).toBe(true);
      if (isJune1815Error(err)) expect(err.code).toBe('pty_dead');
    }
  });

  it('forwards write/resize/kill to the handle', () => {
    const f = fakeHandle();
    const pty = ClaudePty.start(
      { command: 'claude', cwd: '/x', env: {}, cols: 200, rows: 50 },
      fakeSpawner(f.handle),
    );
    pty.write('msg');
    pty.resize(160, 40);
    pty.kill('SIGINT');
    expect(f.writes).toEqual(['msg']);
    expect(f.resizes).toEqual([[160, 40]]);
    expect(f.killed).toEqual(['SIGINT']);
  });

  it('kill on already-exited PTY is a no-op (no throw)', () => {
    const f = fakeHandle();
    const pty = ClaudePty.start(
      { command: 'claude', cwd: '/x', env: {}, cols: 200, rows: 50 },
      fakeSpawner(f.handle),
    );
    f.emitExit({ exitCode: 0, signal: null });
    expect(() => { pty.kill(); }).not.toThrow();
    expect(f.killed).toEqual([]);
  });

  it('reports spawn failure as June1815Error pty_spawn_failed', () => {
    const badSpawner: PtySpawner = {
      spawn: () => {
        throw new Error('exec not found');
      },
    };
    try {
      ClaudePty.start(
        { command: 'claude', cwd: '/x', env: {}, cols: 200, rows: 50 },
        badSpawner,
      );
      expect.fail('expected throw');
    } catch (err) {
      expect(isJune1815Error(err)).toBe(true);
      if (isJune1815Error(err)) {
        expect(err.code).toBe('pty_spawn_failed');
        expect(err.message).toContain('exec not found');
      }
    }
  });
});
