import { describe, expect, it } from 'vitest';
import { formatSseFrame, SSE_HEADERS, SSE_HEARTBEAT } from '../../../src/server/sse.js';
import {
  DoneSchema,
  SseEventSchema,
  TextDeltaSchema,
  ToolUseSchema,
} from '../../../src/server/events.js';

describe('formatSseFrame', () => {
  it('writes event name and JSON payload on consecutive lines', () => {
    const frame = formatSseFrame({ type: 'text_delta', text: 'hi' });
    expect(frame).toContain('event: text_delta');
    expect(frame).toContain('data: {"type":"text_delta","text":"hi"}');
    expect(frame.endsWith('\n\n')).toBe(true);
  });

  it('produces parseable frames', () => {
    const frame = formatSseFrame({
      type: 'done',
      messageId: 'm1',
      sessionId: 's1',
      usage: { inputTokens: 1, outputTokens: 2 },
    });
    const lines = frame.split('\n');
    const dataLine = lines.find((l) => l.startsWith('data: '));
    expect(dataLine).toBeDefined();
    const parsed = JSON.parse((dataLine ?? '').slice('data: '.length));
    expect(DoneSchema.parse(parsed)).toEqual({
      type: 'done',
      messageId: 'm1',
      sessionId: 's1',
      usage: { inputTokens: 1, outputTokens: 2 },
    });
  });
});

describe('SSE_HEARTBEAT and SSE_HEADERS', () => {
  it('heartbeat is an SSE comment line', () => {
    expect(SSE_HEARTBEAT.startsWith(': ')).toBe(true);
    expect(SSE_HEARTBEAT.endsWith('\n\n')).toBe(true);
  });

  it('SSE_HEADERS sets the right content type', () => {
    expect(SSE_HEADERS['Content-Type']).toBe('text/event-stream');
    expect(SSE_HEADERS['Cache-Control']).toContain('no-cache');
  });
});

describe('event schemas', () => {
  it('TextDeltaSchema accepts valid input', () => {
    expect(TextDeltaSchema.parse({ type: 'text_delta', text: 'hi' })).toEqual({
      type: 'text_delta',
      text: 'hi',
    });
  });

  it('ToolUseSchema accepts optional summary', () => {
    expect(ToolUseSchema.parse({ type: 'tool_use', name: 'Bash' })).toEqual({
      type: 'tool_use',
      name: 'Bash',
    });
    expect(ToolUseSchema.parse({ type: 'tool_use', name: 'Read', summary: '/x' })).toEqual({
      type: 'tool_use',
      name: 'Read',
      summary: '/x',
    });
  });

  it('SseEventSchema discriminates by type', () => {
    expect(SseEventSchema.parse({ type: 'ping' })).toEqual({ type: 'ping' });
    expect(() => SseEventSchema.parse({ type: 'unknown', foo: 1 })).toThrow();
  });
});
