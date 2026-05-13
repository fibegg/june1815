import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PATTERNS,
  TuiParser,
  __test,
  type TuiEvent,
} from '../../../src/pty/tui-parser.js';
import type { TerminalSnapshot } from '../../../src/pty/terminal.js';

function snapFromLines(lines: string[], cols = 200, rows = 50): TerminalSnapshot {
  return {
    cols,
    rows,
    lines,
    viewportTop: 0,
    cursorX: 0,
    cursorY: lines.length - 1,
  };
}

describe('computeDelta', () => {
  it('returns empty when equal', () => {
    expect(__test.computeDelta('abc', 'abc')).toBe('');
  });

  it('returns the tail when current extends prev', () => {
    expect(__test.computeDelta('abc', 'abcdef')).toBe('def');
  });

  it('returns the full current when block was re-rendered', () => {
    expect(__test.computeDelta('hello', 'goodbye')).toBe('goodbye');
  });
});

describe('TuiParser ready', () => {
  it('emits a `ready` event the first time the prompt is visible', () => {
    const p = new TuiParser();
    const evs = p.parse(snapFromLines(['│ > ']));
    expect(evs.find((e) => e.type === 'ready')).toBeDefined();
  });

  it('does not re-emit ready on subsequent snapshots', () => {
    const p = new TuiParser();
    p.parse(snapFromLines(['│ > ']));
    const evs2 = p.parse(snapFromLines(['│ > ']));
    expect(evs2.find((e) => e.type === 'ready')).toBeUndefined();
  });
});

describe('TuiParser text deltas', () => {
  it('emits a text_delta for new assistant text', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(snapFromLines(['● Hello']));
    const td = evs.find((e): e is Extract<TuiEvent, { type: 'text_delta' }> => e.type === 'text_delta');
    expect(td?.text).toBe('Hello');
  });

  it('emits an incremental delta as text grows across snapshots', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    p.parse(snapFromLines(['● Hello']));
    const evs2 = p.parse(snapFromLines(['● Hello world']));
    const td = evs2.find((e): e is Extract<TuiEvent, { type: 'text_delta' }> => e.type === 'text_delta');
    expect(td?.text).toBe(' world');
  });

  it('emits the whole new block when the assistant region was re-rendered', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    p.parse(snapFromLines(['● First answer']));
    const evs = p.parse(snapFromLines(['● Different answer']));
    const td = evs.find((e): e is Extract<TuiEvent, { type: 'text_delta' }> => e.type === 'text_delta');
    expect(td?.text).toBe('Different answer');
  });

  it('stops at the block-end marker', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(
      snapFromLines(['● Real answer', 'next paragraph', '───────────', 'Usage: 1 in / 2 out']),
    );
    const td = evs.find((e): e is Extract<TuiEvent, { type: 'text_delta' }> => e.type === 'text_delta');
    expect(td?.text).toContain('Real answer');
    expect(td?.text).toContain('next paragraph');
    expect(td?.text).not.toContain('Usage:');
  });
});

describe('TuiParser reasoning', () => {
  it('emits reasoning_delta for thinking blocks', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(snapFromLines(['✻ Thinking', '  weighing options', '  it depends']));
    const r = evs.find((e): e is Extract<TuiEvent, { type: 'reasoning_delta' }> => e.type === 'reasoning_delta');
    expect(r?.text).toContain('weighing options');
  });
});

describe('TuiParser tool calls', () => {
  it('emits a tool_use event with name and summary', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(snapFromLines(['⏺ Read(/etc/hosts)']));
    const t = evs.find((e): e is Extract<TuiEvent, { type: 'tool_use' }> => e.type === 'tool_use');
    expect(t).toEqual({ type: 'tool_use', name: 'Read', summary: '/etc/hosts' });
  });

  it('does not re-emit the same tool line on the next snapshot', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    p.parse(snapFromLines(['⏺ Bash(ls)']));
    const evs2 = p.parse(snapFromLines(['⏺ Bash(ls)']));
    expect(evs2.find((e) => e.type === 'tool_use')).toBeUndefined();
  });
});

describe('TuiParser usage', () => {
  it('emits a usage event from a footer line', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(snapFromLines(['Usage: 1234 in / 567 out']));
    const u = evs.find((e): e is Extract<TuiEvent, { type: 'usage' }> => e.type === 'usage');
    expect(u).toEqual({ type: 'usage', inputTokens: 1234, outputTokens: 567 });
  });

  it('deduplicates identical usage', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    p.parse(snapFromLines(['Usage: 1 in / 2 out']));
    const evs2 = p.parse(snapFromLines(['Usage: 1 in / 2 out']));
    expect(evs2.find((e) => e.type === 'usage')).toBeUndefined();
  });
});

describe('TuiParser permission prompts', () => {
  it('emits a permission_prompt when a question appears', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(snapFromLines(['Allow Claude to run this command? (y/N)']));
    const q = evs.find(
      (e): e is Extract<TuiEvent, { type: 'permission_prompt' }> => e.type === 'permission_prompt',
    );
    expect(q?.question).toContain('Allow');
  });
});

describe('TuiParser turn_complete', () => {
  it('emits turn_complete when ready reappears after activity', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    p.parse(snapFromLines(['● Hello'])); // activity, no ready
    const evs = p.parse(snapFromLines(['● Hello', '│ > '])); // ready visible
    expect(evs.find((e) => e.type === 'turn_complete')).toBeDefined();
  });
});

describe('TuiParser auth_required', () => {
  it('emits auth_required when an OAuth URL appears', () => {
    const p = new TuiParser();
    const evs = p.parse(
      snapFromLines(['Open https://claude.ai/oauth/authorize?code=xyz to log in']),
    );
    const a = evs.find(
      (e): e is Extract<TuiEvent, { type: 'auth_required' }> => e.type === 'auth_required',
    );
    expect(a?.url).toMatch(/^https:\/\/claude\.ai/);
  });
});

describe('DEFAULT_PATTERNS', () => {
  it('matches the documented landmarks (sanity check on regex objects)', () => {
    expect(DEFAULT_PATTERNS.readyMarker.test('│ > ')).toBe(true);
    expect(DEFAULT_PATTERNS.assistantBlockStart.test('● hi')).toBe(true);
    expect(DEFAULT_PATTERNS.reasoningBlockStart.test('✻ Thinking')).toBe(true);
    expect(DEFAULT_PATTERNS.toolCallLine.test('⏺ Bash(ls)')).toBe(true);
    expect(DEFAULT_PATTERNS.usageLine.test('Usage: 10 in / 20 out')).toBe(true);
  });
});
