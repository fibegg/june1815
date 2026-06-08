import { describe, expect, it } from 'vitest';
import { EventToStream, type NdjsonSink } from '../../../../src/cli/shim/event-to-stream.js';
import { BUILT_IN_TOOL_DEFS } from '../../../../src/tools/built-in-tool-defs.js';
import { ToolInputSynthesizer } from '../../../../src/tools/synthesizer.js';

function recordingSink(): NdjsonSink & { lines: object[] } {
  const lines: object[] = [];
  return {
    lines,
    write: (line: string) => {
      expect(line.endsWith('\n')).toBe(true);
      const parsed = JSON.parse(line.slice(0, -1)) as object;
      lines.push(parsed);
    },
  };
}

function makeWriter(overrides: Partial<{ now: () => number; uuid: () => string }> = {}): EventToStream {
  let n = 0;
  return new EventToStream({
    sessionId: 'sess_test',
    cwd: '/private/tmp',
    model: 'claude-opus-4-7',
    permissionMode: 'bypassPermissions',
    synthesizer: ToolInputSynthesizer.fromDefs([BUILT_IN_TOOL_DEFS]),
    now: overrides.now ?? (() => 1_000),
    uuid: overrides.uuid ?? (() => `u${(n += 1)}`),
  });
}

describe('EventToStream', () => {
  it('emitInit writes a system/init line with the right shape', () => {
    const sink = recordingSink();
    makeWriter().emitInit(sink);
    expect(sink.lines).toHaveLength(1);
    expect(sink.lines[0]).toMatchObject({
      type: 'system',
      subtype: 'init',
      cwd: '/private/tmp',
      model: 'claude-opus-4-7',
      permissionMode: 'bypassPermissions',
      session_id: 'sess_test',
      tools: [],
      mcp_servers: [],
    });
  });

  it('text_delta becomes a content_block_delta with text_delta inner event', () => {
    const sink = recordingSink();
    const w = makeWriter();
    w.emitInit(sink);
    w.beginTurn();
    w.onEvent({ type: 'text_delta', text: 'Hello' }, sink);
    expect(sink.lines).toHaveLength(2);
    expect(sink.lines[1]).toMatchObject({
      type: 'stream_event',
      session_id: 'sess_test',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      },
    });
  });

  it('reasoning_delta becomes a thinking_delta event', () => {
    const sink = recordingSink();
    const w = makeWriter();
    w.emitInit(sink);
    w.beginTurn();
    w.onEvent({ type: 'reasoning_delta', text: 'thinking…' }, sink);
    expect(sink.lines[1]).toMatchObject({
      event: { delta: { type: 'thinking_delta', thinking: 'thinking…' } },
    });
  });

  it('tool_use emits start + stop with synthesized input', () => {
    const sink = recordingSink();
    const w = makeWriter();
    w.emitInit(sink);
    w.beginTurn();
    w.onEvent({ type: 'tool_use', name: 'Read', summary: '/etc/hosts' }, sink);

    const starts = sink.lines.filter(
      (l): l is { event: { type: string; content_block: { name: string; input: unknown } } } =>
        (l as { event?: { type?: string } }).event?.type === 'content_block_start',
    );
    expect(starts).toHaveLength(1);
    expect(starts[0]?.event.content_block.name).toBe('Read');
    expect(starts[0]?.event.content_block.input).toEqual({ file_path: '/etc/hosts' });

    const stops = sink.lines.filter(
      (l) => (l as { event?: { type?: string } }).event?.type === 'content_block_stop',
    );
    expect(stops).toHaveLength(1);
  });

  it('turn_complete flushes assistant message + success result with accumulated text', () => {
    const sink = recordingSink();
    const w = makeWriter({ now: () => 1_500 });
    w.emitInit(sink);
    w.beginTurn();
    w.onEvent({ type: 'text_delta', text: 'Hello' }, sink);
    w.onEvent({ type: 'text_delta', text: ' world' }, sink);
    w.onEvent({ type: 'usage', inputTokens: 12, outputTokens: 34 }, sink);
    w.onEvent({ type: 'turn_complete' }, sink);

    const assistant = sink.lines.find((l) => (l as { type?: string }).type === 'assistant') as
      | { message: { content: Array<{ text: string }> }; session_id: string }
      | undefined;
    expect(assistant?.message.content).toEqual([{ type: 'text', text: 'Hello world' }]);
    expect(assistant?.session_id).toBe('sess_test');

    const result = sink.lines.find((l) => (l as { type?: string }).type === 'result') as
      | { subtype: string; is_error: boolean; result: string; usage: { input_tokens: number; output_tokens: number } }
      | undefined;
    expect(result?.subtype).toBe('success');
    expect(result?.is_error).toBe(false);
    expect(result?.result).toBe('Hello world');
    expect(result?.usage).toEqual({ input_tokens: 12, output_tokens: 34 });
  });

  it('error + turn_complete emits a result/error', () => {
    const sink = recordingSink();
    const w = makeWriter();
    w.emitInit(sink);
    w.beginTurn();
    w.onEvent({ type: 'text_delta', text: 'partial' }, sink);
    w.onEvent({ type: 'error', code: 'claude_api_error', message: 'rate limit' }, sink);
    w.onEvent({ type: 'turn_complete' }, sink);

    const result = sink.lines.find((l) => (l as { type?: string }).type === 'result') as
      | { subtype: string; is_error: boolean; errors: string[] }
      | undefined;
    expect(result?.subtype).toBe('error');
    expect(result?.is_error).toBe(true);
    expect(result?.errors[0]).toMatch(/claude_api_error/);
  });

  it('pty_exited emits a terminal error result', () => {
    const sink = recordingSink();
    const w = makeWriter();
    w.emitInit(sink);
    w.beginTurn();
    w.onEvent({ type: 'pty_exited', exitCode: 1, signal: null }, sink);
    const result = sink.lines.find((l) => (l as { type?: string }).type === 'result') as
      | { is_error: boolean; errors: string[] }
      | undefined;
    expect(result?.is_error).toBe(true);
    expect(result?.errors[0]).toMatch(/pty_exited/);
  });

  it('session_id is consistent across every emitted message', () => {
    const sink = recordingSink();
    const w = makeWriter();
    w.emitInit(sink);
    w.beginTurn();
    w.onEvent({ type: 'text_delta', text: 'x' }, sink);
    w.onEvent({ type: 'tool_use', name: 'Read', summary: '/p' }, sink);
    w.onEvent({ type: 'turn_complete' }, sink);
    for (const line of sink.lines) {
      expect((line as { session_id?: string }).session_id).toBe('sess_test');
    }
  });

  it('emitStartupError emits a result/error without requiring a turn', () => {
    const sink = recordingSink();
    makeWriter().emitStartupError(sink, 'JUNE1815_CLAUDE_PATH not set');
    expect(sink.lines).toHaveLength(1);
    expect(sink.lines[0]).toMatchObject({
      type: 'result',
      subtype: 'error',
      is_error: true,
      errors: ['JUNE1815_CLAUDE_PATH not set'],
    });
  });

  it('emits NDJSON: each line is exactly one JSON object terminated by \\n', () => {
    // Build a hand-rolled sink that captures raw strings (not parsed).
    const raw: string[] = [];
    const w = makeWriter();
    const rawSink: NdjsonSink = { write: (s) => { raw.push(s); } };
    w.emitInit(rawSink);
    w.beginTurn();
    w.onEvent({ type: 'text_delta', text: 'a' }, rawSink);
    w.onEvent({ type: 'turn_complete' }, rawSink);
    for (const line of raw) {
      expect(line.endsWith('\n')).toBe(true);
      expect(() => { JSON.parse(line.slice(0, -1)); }).not.toThrow();
      expect(line.slice(0, -1).includes('\n')).toBe(false);
    }
  });
});
