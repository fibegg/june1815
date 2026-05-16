import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runShim } from '../../../../src/cli/shim/runner.js';
import type {
  PtyHandle,
  PtySpawnOptions,
  PtySpawner,
} from '../../../../src/pty/claude-pty.js';

/* ────────────────────────── test scaffolding ──────────────────────────── */

interface RecordedWrite {
  readonly data: string;
}

/**
 * Scriptable PTY fake. The test installs `onWrite` to react to bytes
 * the runner sends (so we can emit a scripted response only AFTER the
 * runner has submitted the user input). Use `emit()` to push raw bytes
 * back through the data listener.
 */
function fakePty(opts: { onWrite?: (data: string, emit: (b: string) => void) => void } = {}): {
  spawner: PtySpawner;
  emit: (data: string) => void;
  writes: RecordedWrite[];
  exit: (code: number) => void;
  spawned: PtySpawnOptions[];
} {
  let dataListener: ((d: string) => void) | null = null;
  let exitListener: ((info: { exitCode: number; signal: number | null }) => void) | null = null;
  const writes: RecordedWrite[] = [];
  const spawned: PtySpawnOptions[] = [];
  const emit = (data: string): void => {
    if (dataListener) dataListener(data);
  };

  const handle: PtyHandle = {
    pid: 12345,
    onData: (l) => {
      dataListener = l;
      return () => { dataListener = null; };
    },
    onExit: (l) => {
      exitListener = l;
      return () => { exitListener = null; };
    },
    write: (d) => {
      writes.push({ data: d });
      opts.onWrite?.(d, emit);
    },
    resize: () => undefined,
    kill: () => {
      exitListener?.({ exitCode: 0, signal: null });
    },
  };

  const spawner: PtySpawner = {
    spawn: (sp) => {
      spawned.push(sp);
      return handle;
    },
  };

  return {
    spawner,
    emit,
    exit: (code) => exitListener?.({ exitCode: code, signal: null }),
    writes,
    spawned,
  };
}

function ndjsonSink(): {
  sink: { write: (line: string) => void };
  lines: unknown[];
  raw: string[];
} {
  const raw: string[] = [];
  const lines: unknown[] = [];
  return {
    raw,
    lines,
    sink: {
      write: (line) => {
        raw.push(line);
        // Lines are expected to end in \n; parse the inner JSON.
        const trimmed = line.endsWith('\n') ? line.slice(0, -1) : line;
        if (trimmed.length > 0) lines.push(JSON.parse(trimmed));
      },
    },
  };
}

async function* fromString(s: string): AsyncIterable<string> {
  yield s;
}

/** Bytes that bring the parser to the `ready` state (cross-turn). */
const READY_BYTES = '? for shortcuts\r\n';

/** Build a scripted turn response that the parser turns into:
 *  user echo → assistant text → past-tense summary (turn_complete). */
function scriptedTurnResponse(userText: string, assistantText: string, extraLines: readonly string[] = []): string {
  const userEcho = `❯ ${userText}\r\n`;
  const assistant = `⏺ ${assistantText}\r\n`;
  const extra = extraLines.map((l) => `${l}\r\n`).join('');
  const summary = '✻ Brewed for 1s\r\n';
  return userEcho + assistant + extra + summary;
}

/* ────────────────────────────── tests ─────────────────────────────────── */

describe('runShim end-to-end with stub PTY', () => {
  const tmpDirs: string[] = [];
  afterEach(() => { tmpDirs.splice(0); });

  function newDataDir(): string {
    const d = join(tmpdir(), `june15-runner-test-${Math.random().toString(36).slice(2)}`);
    mkdirSync(d, { recursive: true });
    tmpDirs.push(d);
    return d;
  }

  it('emits system/init first, even when JUNE15_CLAUDE_PATH is missing', async () => {
    const out = ndjsonSink();
    const code = await runShim({
      argv: ['--output-format', 'stream-json', '--input-format', 'stream-json'],
      env: { JUNE15_DATA_DIR: newDataDir() },
      io: { stdout: out.sink, stderr: () => undefined },
      stdin: fromString(''),
    });
    expect(code).toBe(1);
    expect(out.lines[0]).toMatchObject({ type: 'system', subtype: 'init' });
    expect(out.lines[1]).toMatchObject({
      type: 'result',
      subtype: 'error',
      is_error: true,
      errors: ['JUNE15_CLAUDE_PATH is not set'],
    });
  });

  it('emits a result/error when JUNE15_CLAUDE_PATH points to a non-existent path', async () => {
    const out = ndjsonSink();
    const code = await runShim({
      argv: ['--output-format', 'stream-json', '--input-format', 'stream-json'],
      env: {
        JUNE15_CLAUDE_PATH: '/does/not/exist/claude',
        JUNE15_DATA_DIR: newDataDir(),
      },
      io: { stdout: out.sink, stderr: () => undefined },
      stdin: fromString(''),
    });
    expect(code).toBe(1);
    expect((out.lines[1] as { errors: string[] }).errors[0]).toMatch(/non-existent/);
  });

  it('forwards user text and emits text_delta + result on a scripted turn', async () => {
    const out = ndjsonSink();
    const dataDir = newDataDir();
    const fakeClaude = join(dataDir, 'claude-stub');
    writeFileSync(fakeClaude, '#!/bin/sh\nexit 0\n');

    // Phase 1: bring the parser to ready before the user message is read.
    // Phase 2: on the first PTY write (the user's submit), emit the
    // scripted response that drives one full turn.
    let submitSeen = false;
    const pty = fakePty({
      onWrite: (data, emit) => {
        if (submitSeen) return;
        // Wait for the actual submit character; the body is written in a
        // separate call from `\r`.
        if (!data.includes('\r')) return;
        submitSeen = true;
        emit(scriptedTurnResponse('say hello', 'HELLO'));
      },
    });
    setImmediate(() => { pty.emit(READY_BYTES); });

    const userMsg = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'say hello' }] },
    });

    const code = await runShim({
      argv: [
        '--output-format', 'stream-json',
        '--input-format', 'stream-json',
        '--model', 'claude-opus-4-7',
      ],
      env: {
        JUNE15_CLAUDE_PATH: fakeClaude,
        JUNE15_DATA_DIR: dataDir,
      },
      io: { stdout: out.sink, stderr: () => undefined },
      stdin: fromString(`${userMsg}\n`),
      spawner: pty.spawner,
    });

    expect(code).toBe(0);

    expect(out.lines[0]).toMatchObject({
      type: 'system',
      subtype: 'init',
      model: 'claude-opus-4-7',
    });

    const textDelta = out.lines.find(
      (l) =>
        (l as { type?: string; event?: { delta?: { type?: string } } }).type === 'stream_event'
        && (l as { event?: { delta?: { type?: string } } }).event?.delta?.type === 'text_delta',
    ) as { event: { delta: { text: string } } } | undefined;
    expect(textDelta?.event.delta.text).toBe('HELLO');

    const result = out.lines.find((l) => (l as { type?: string }).type === 'result') as
      | { subtype: string; result: string }
      | undefined;
    expect(result?.subtype).toBe('success');
    expect(result?.result).toBe('HELLO');

    const combined = pty.writes.map((w) => w.data).join('');
    expect(combined).toContain('say hello');
  });

  it('a user-supplied tool-defs file overrides the built-in mapping', async () => {
    const dataDir = newDataDir();
    const fakeClaude = join(dataDir, 'claude-stub');
    writeFileSync(fakeClaude, '#!/bin/sh\nexit 0\n');
    const toolDefsPath = join(dataDir, 'tool-defs.json');
    writeFileSync(
      toolDefsPath,
      JSON.stringify({
        version: 1,
        tools: { Read: { input: { my_field: '{summary}', kind: 'override' } } },
      }),
    );

    let submitSeen = false;
    const pty = fakePty({
      onWrite: (data, emit) => {
        if (submitSeen) return;
        if (!data.includes('\r')) return;
        submitSeen = true;
        emit(scriptedTurnResponse('look at it', 'Read(/etc/hosts)'));
      },
    });
    setImmediate(() => { pty.emit(READY_BYTES); });

    const out = ndjsonSink();
    const userMsg = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'look at it' }] },
    });

    await runShim({
      argv: [
        '--output-format', 'stream-json',
        '--input-format', 'stream-json',
        '--tool-defs', toolDefsPath,
      ],
      env: {
        JUNE15_CLAUDE_PATH: fakeClaude,
        JUNE15_DATA_DIR: dataDir,
      },
      io: { stdout: out.sink, stderr: () => undefined },
      stdin: fromString(`${userMsg}\n`),
      spawner: pty.spawner,
    });

    const start = out.lines.find(
      (l) =>
        (l as { event?: { type?: string } }).event?.type === 'content_block_start',
    ) as { event: { content_block: { name: string; input: Record<string, unknown> } } } | undefined;
    expect(start?.event.content_block.name).toBe('Read');
    expect(start?.event.content_block.input).toEqual({
      my_field: '/etc/hosts',
      kind: 'override',
    });
  });
});
