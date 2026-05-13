import type * as NodePtyModule from 'node-pty';
import { June15Error } from '../errors.js';

/** Information emitted when the PTY child process exits. */
export interface PtyExit {
  readonly exitCode: number;
  readonly signal: number | null;
}

/** Lifecycle states. */
export type PtyState = 'alive' | 'exited';

/** Lower-level PTY operations the wrapper needs. Implemented by node-pty in
 *  production and by tests with a fake handle. */
export interface PtyHandle {
  readonly pid: number;
  onData(listener: (data: string) => void): () => void;
  onExit(listener: (info: PtyExit) => void): () => void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export interface PtySpawnOptions {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly cols: number;
  readonly rows: number;
}

/** Pluggable spawner. Production uses node-pty; tests pass a fake. */
export interface PtySpawner {
  spawn(opts: PtySpawnOptions): PtyHandle;
}

/**
 * Lazy node-pty spawner. node-pty is a native module — we resolve it on
 * first use so consumers without prebuilt binaries get a clear error at
 * spawn time rather than at import time.
 */
export class NodePtySpawner implements PtySpawner {
  spawn(opts: PtySpawnOptions): PtyHandle {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pty = require('node-pty') as typeof NodePtyModule;
    const child = pty.spawn(opts.command, [...(opts.args ?? [])], {
      cwd: opts.cwd,
      env: { ...(opts.env as Record<string, string>) },
      cols: opts.cols,
      rows: opts.rows,
      name: 'xterm-256color',
    });
    return {
      pid: child.pid,
      onData: (l) => {
        const d = child.onData(l);
        return () => { d.dispose(); };
      },
      onExit: (l) => {
        const d = child.onExit(({ exitCode, signal }) =>
          { l({ exitCode, signal: typeof signal === 'number' ? signal : null }); },
        );
        return () => { d.dispose(); };
      },
      write: (data) => { child.write(data); },
      resize: (c, r) => { child.resize(c, r); },
      kill: (sig) => { child.kill(sig); },
    };
  }
}

type DataListener = (data: string) => void;
type ExitListener = (info: PtyExit) => void;

/**
 * Higher-level wrapper over `PtyHandle`. Tracks lifecycle state, fans out
 * data and exit events to multiple consumers, and refuses operations on a
 * dead PTY with a typed `June15Error('pty_dead')`.
 */
export class ClaudePty {
  private constructor(
    private readonly handle: PtyHandle,
    private _state: PtyState,
  ) {}

  static start(opts: PtySpawnOptions, spawner: PtySpawner = new NodePtySpawner()): ClaudePty {
    let handle: PtyHandle;
    try {
      handle = spawner.spawn(opts);
    } catch (err) {
      throw new June15Error('pty_spawn_failed', `failed to spawn PTY: ${(err as Error).message}`, {
        command: opts.command,
      });
    }
    const pty = new ClaudePty(handle, 'alive');
    handle.onExit((info) => {
      pty._state = 'exited';
      pty.emitExit(info);
    });
    handle.onData((d) => { pty.emitData(d); });
    return pty;
  }

  private readonly dataListeners = new Set<DataListener>();
  private readonly exitListeners = new Set<ExitListener>();

  get pid(): number {
    return this.handle.pid;
  }

  get state(): PtyState {
    return this._state;
  }

  onData(listener: DataListener): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onExit(listener: ExitListener): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  write(data: string): void {
    this.assertAlive('write');
    this.handle.write(data);
  }

  resize(cols: number, rows: number): void {
    this.assertAlive('resize');
    this.handle.resize(cols, rows);
  }

  kill(signal?: string): void {
    if (this._state === 'exited') return;
    this.handle.kill(signal);
  }

  private assertAlive(op: string): void {
    if (this._state !== 'alive') {
      throw new June15Error('pty_dead', `cannot ${op} on a PTY that has exited`);
    }
  }

  private emitData(data: string): void {
    for (const l of this.dataListeners) l(data);
  }

  private emitExit(info: PtyExit): void {
    for (const l of this.exitListeners) l(info);
  }
}
