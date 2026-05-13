import { describe, expect, it } from 'vitest';
import { Conversation, type ConversationDeps, type ConversationEvent } from '../../../src/conversation/conversation.js';
import { MessageQueue } from '../../../src/conversation/queue.js';
import type { ClaudePty, PtyExit } from '../../../src/pty/claude-pty.js';
import { InputDriver, type PtyWriter } from '../../../src/pty/input-driver.js';
import { TerminalAdapter } from '../../../src/pty/terminal.js';
import { TuiParser } from '../../../src/pty/tui-parser.js';

/**
 * Test scaffolding — a fake ClaudePty whose `onData`/`onExit` listeners
 * are kept and can be invoked from outside, simulating the real PTY's
 * push of bytes / exit signal.
 */
function makeFakePty(): { pty: ClaudePty; emitData: (d: string) => void; emitExit: (i: PtyExit) => void; writes: string[]; killed: boolean } {
  let dataListeners: Array<(d: string) => void> = [];
  let exitListeners: Array<(i: PtyExit) => void> = [];
  const writes: string[] = [];
  let killed = false;
  const pty: ClaudePty = {
    get pid() {
      return 1234;
    },
    get state() {
      return killed ? 'exited' : 'alive';
    },
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
    resize: () => {},
    kill: () => {
      killed = true;
    },
  } as unknown as ClaudePty;
  return {
    pty,
    emitData: (d) => dataListeners.forEach((l) => l(d)),
    emitExit: (i) => exitListeners.forEach((l) => l(i)),
    writes,
    get killed() {
      return killed;
    },
  };
}

interface Setup {
  pty: ClaudePty;
  emitData: (d: string) => void;
  emitExit: (i: PtyExit) => void;
  ptyWrites: string[];
  conv: Conversation;
  events: ConversationEvent[];
}

function setupConversation(overrides: Partial<ConversationDeps> = {}): Setup {
  const f = makeFakePty();
  const terminal = new TerminalAdapter({ cols: 200, rows: 50 });
  const parser = new TuiParser();
  const writer: PtyWriter = { write: (d) => f.writes.push(`drv:${d}`) };
  const driver = new InputDriver(writer);
  const conv = new Conversation({
    id: overrides.id ?? 'c-1',
    cwd: overrides.cwd ?? '/tmp',
    pty: f.pty,
    terminal,
    parser,
    driver,
    queue: new MessageQueue(),
    idleQuietMs: 5,
    ...overrides,
  });
  const events: ConversationEvent[] = [];
  conv.onEvent((e) => events.push(e));
  return { ...f, ptyWrites: f.writes, conv, events };
}

describe('Conversation lifecycle', () => {
  it('starts in `starting` state', () => {
    const { conv } = setupConversation();
    expect(conv.state).toBe('starting');
  });

  it('transitions to `ready` when the parser emits ready', async () => {
    const { emitData, conv, events } = setupConversation();
    emitData('│ > \r\n');
    await conv.snapshotNow();
    expect(conv.state).toBe('ready');
    expect(events.find((e) => e.type === 'ready')).toBeDefined();
  });

  it('rejects send before ready by queueing without writing', () => {
    const { conv, ptyWrites } = setupConversation();
    conv.send('hi');
    expect(conv.state).toBe('starting');
    // driver hasn't written yet
    expect(ptyWrites.filter((w) => w.startsWith('drv:')).length).toBe(0);
    expect(conv.pendingCount).toBe(1);
  });

  it('drains the queue once ready is reached', async () => {
    const { emitData, conv, ptyWrites } = setupConversation();
    conv.send('hello there');
    emitData('│ > \r\n');
    await conv.snapshotNow();
    expect(conv.state).toBe('busy');
    const drvWrites = ptyWrites.filter((w) => w.startsWith('drv:'));
    expect(drvWrites.join('')).toContain('hello there');
  });

  it('transitions back to ready on turn_complete and drains the next message', async () => {
    const { emitData, conv, events } = setupConversation();
    conv.send('one');
    conv.send('two');
    emitData('│ > \r\n');
    await conv.snapshotNow();
    // First turn started
    expect(conv.state).toBe('busy');
    // Simulate the assistant output and then ready reappearing
    emitData('● done\r\n│ > \r\n');
    await conv.snapshotNow();
    // Turn complete should have been emitted
    expect(events.find((e) => e.type === 'turn_complete')).toBeDefined();
    // ...and the second message should have started
    expect(conv.state).toBe('busy');
    const started = events.filter((e) => e.type === 'message_started');
    expect(started.length).toBe(2);
  });

  it('interrupt is a no-op when not busy', () => {
    const { conv, ptyWrites } = setupConversation();
    conv.interrupt();
    expect(ptyWrites.filter((w) => w.includes('\x03'))).toEqual([]);
  });

  it('interrupt while busy sends Ctrl-C and clears in-flight', async () => {
    const { emitData, conv, ptyWrites } = setupConversation();
    conv.send('hi');
    emitData('│ > \r\n');
    await conv.snapshotNow();
    conv.interrupt();
    expect(ptyWrites.some((w) => w === 'drv:\x03')).toBe(true);
  });

  it('kill sets state to killed and ignores subsequent sends', () => {
    const { conv } = setupConversation();
    conv.kill();
    expect(conv.state).toBe('killed');
    expect(() => conv.send('after-death')).toThrow();
  });

  it('pty_exited event is emitted when the PTY dies on its own', () => {
    const { emitExit, conv, events } = setupConversation();
    emitExit({ exitCode: 137, signal: 9 });
    expect(conv.state).toBe('killed');
    const exited = events.find(
      (e): e is Extract<ConversationEvent, { type: 'pty_exited' }> => e.type === 'pty_exited',
    );
    expect(exited?.exitCode).toBe(137);
    expect(exited?.signal).toBe(9);
  });

  it('waitForReady resolves when ready is reached', async () => {
    const { emitData, conv } = setupConversation();
    const p = conv.waitForReady(1000);
    emitData('│ > \r\n');
    await conv.snapshotNow();
    await expect(p).resolves.toBeUndefined();
  });

  it('waitForReady rejects when PTY exits first', async () => {
    const { emitExit, conv } = setupConversation();
    const p = conv.waitForReady(1000);
    emitExit({ exitCode: 1, signal: null });
    await expect(p).rejects.toThrow();
  });
});
