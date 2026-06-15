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
    const evs = p.parse(snapFromLines(['? for shortcuts']));
    expect(evs.find((e) => e.type === 'ready')).toBeDefined();
  });

  it('does not re-emit ready on subsequent snapshots', () => {
    const p = new TuiParser();
    p.parse(snapFromLines(['? for shortcuts']));
    const evs2 = p.parse(snapFromLines(['? for shortcuts']));
    expect(evs2.find((e) => e.type === 'ready')).toBeUndefined();
  });
});

describe('TuiParser text deltas', () => {
  it('emits a text_delta for new assistant text', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(snapFromLines(['⏺ Hello']));
    const td = evs.find((e): e is Extract<TuiEvent, { type: 'text_delta' }> => e.type === 'text_delta');
    expect(td?.text).toBe('Hello');
  });

  it('emits text_delta for Claude 2.1.177 black-circle assistant text', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(snapFromLines(['❯ Reply with exactly: HI', '● HI', '✻ Worked for 2s']));
    const td = evs.find((e): e is Extract<TuiEvent, { type: 'text_delta' }> => e.type === 'text_delta');
    expect(td?.text).toBe('HI');
  });

  it('uses the latest Claude 2.1.177 assistant segment and skips chrome lines', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    p.parse(snapFromLines([
      '❯ How many Fibe playgrounds do I have?',
      "● I'll use the Fibe tools to count your playgrounds.",
      '●',
      '                                                                                                                                                                                           26218 tokens',
      '● fibe - fibe_resource_list (MCP)(resource: "playground", only: ["id","name"])',
      '* Jitterbugging… (12s · ↑ 750 tokens)',
      '                                                                                                                                                                                           ◈ max · /effort',
    ]));
    const evs = p.parse(snapFromLines([
      '❯ How many Fibe playgrounds do I have?',
      "● I'll use the Fibe tools to count your playgrounds.",
      '●',
      '                                                                                                                                                                                           26218 tokens',
      '● fibe - fibe_resource_list (MCP)(resource: "playground", only: ["id","name"])',
      '* Jitterbugging… (12s · ↑ 750 tokens)',
      '●You have 38 Fibe playgrounds.',
      '✻ Worked for 15s',
    ]));
    const td = evs.find((e): e is Extract<TuiEvent, { type: 'text_delta' }> => e.type === 'text_delta');
    expect(td?.text).toBe('You have 38 Fibe playgrounds.');
  });

  it('emits an incremental delta as text grows across snapshots', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    p.parse(snapFromLines(['⏺ Hello']));
    const evs2 = p.parse(snapFromLines(['⏺ Hello world']));
    const td = evs2.find((e): e is Extract<TuiEvent, { type: 'text_delta' }> => e.type === 'text_delta');
    expect(td?.text).toBe(' world');
  });

  it('emits the whole new block when the assistant region was re-rendered', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    p.parse(snapFromLines(['⏺ First answer']));
    const evs = p.parse(snapFromLines(['⏺ Different answer']));
    const td = evs.find((e): e is Extract<TuiEvent, { type: 'text_delta' }> => e.type === 'text_delta');
    expect(td?.text).toBe('Different answer');
  });

  it('stops at the block-end marker', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(
      snapFromLines(['⏺ Real answer', 'next paragraph', '───────────', 'Usage: 1 in / 2 out']),
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
    const evs = p.parse(snapFromLines(['✻ Thinking…', '  weighing options', '  it depends']));
    const r = evs.find((e): e is Extract<TuiEvent, { type: 'reasoning_delta' }> => e.type === 'reasoning_delta');
    expect(r?.text).toContain('weighing options');
  });

  it('does not emit effort chrome as reasoning for spinner-only Claude 2.1.177 snapshots', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(snapFromLines([
      '✻ Evaporating… (0s)',
      '                                                                                                                                                                                         ○ low · /effort',
      '                                                                                                                                                                                         26218 tokens',
    ]));
    expect(evs.find((e) => e.type === 'reasoning_delta')).toBeUndefined();
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

  it('emits a tool_use for Claude 2.1.177 MCP tool display lines', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(snapFromLines(['● fibe - fibe_resource_list (MCP)(resource: "playground")']));
    const t = evs.find((e): e is Extract<TuiEvent, { type: 'tool_use' }> => e.type === 'tool_use');
    expect(t).toEqual({ type: 'tool_use', name: 'fibe_resource_list', summary: 'resource: "playground"' });
    expect(evs.find((e) => e.type === 'text_delta')).toBeUndefined();
  });

  it('emits a tool_use for MCP display lines without rendered args', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(snapFromLines(['● fibe - fibe_resource_list (MCP)']));
    const t = evs.find((e): e is Extract<TuiEvent, { type: 'tool_use' }> => e.type === 'tool_use');
    expect(t).toEqual({ type: 'tool_use', name: 'fibe_resource_list' });
    expect(evs.find((e) => e.type === 'text_delta')).toBeUndefined();
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

  it('does NOT mistake tip lines containing "Run" or "?" for permission prompts', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(
      snapFromLines([
        '⎿  Tip: Running multiple Claude sessions? Use /color and /rename.',
        '⎿  Tip: Use /permissions to pre-approve and pre-deny.',
      ]),
    );
    expect(evs.find((e) => e.type === 'permission_prompt')).toBeUndefined();
  });
});

describe('TuiParser turn_complete', () => {
  it('emits turn_complete when ready reappears after activity', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    // mid-turn: footer is `esc to interrupt`, with assistant content visible
    p.parse(snapFromLines(['⏺ Hello', 'esc to interrupt ● high']));
    // turn ends: footer flips back to `? for shortcuts`
    const evs = p.parse(snapFromLines(['⏺ Hello', '? for shortcuts ● high']));
    expect(evs.find((e) => e.type === 'turn_complete')).toBeDefined();
  });

  it('emits turn_complete via the sawBusy latch even if a later snapshot loses the ready footer', () => {
    // This is the live-stuck bug: an image-attached turn finishes with an
    // API error, the ready footer flashes once, then the next snapshot
    // re-renders with characters our footer regex doesn't match. Without
    // the sawBusy latch, the conversation would be stuck in busy forever.
    const p = new TuiParser();
    p.markTurnStarted();
    // 1. busy footer first — claude starts working
    p.parse(snapFromLines(['esc to interrupt']));
    // 2. API error renders + ready footer briefly visible (fires turn_complete here on the canonical path)
    p.parse(
      snapFromLines([
        '⎿  API Error: 400 invalid_request_error',
        '? for shortcuts',
      ]),
    );
    // 3. Next snapshot the footer becomes unrecognised — but the latch
    //    means turn_complete already fired on snapshot 2, and re-firing
    //    is gated by inTurn (false now).
    const evs3 = p.parse(snapFromLines(['⎿  API Error: 400 invalid_request_error']));
    // No re-fire (inTurn is false after turn_complete).
    expect(evs3.find((e) => e.type === 'turn_complete')).toBeUndefined();
  });

  it('emits turn_complete on the *first* snapshot after busy that still shows ready, even mixed with activity', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    p.parse(snapFromLines(['esc to interrupt']));
    p.parse(snapFromLines(['⏺ Hello', '⎿  API Error: 400', 'esc to interrupt']));
    const evs = p.parse(
      snapFromLines(['⏺ Hello', '⎿  API Error: 400', '? for shortcuts']),
    );
    expect(evs.find((e) => e.type === 'turn_complete')).toBeDefined();
  });

  it('emits turn_complete on past-tense `✻ Verbed for Ns` summary, even with no footer in the buffer', () => {
    // The live image-error case: the buffer never contains the
    // bypass-permissions footer at all (it gets rendered past row 49
    // and falls off the captured snapshot), but the past-tense
    // `✻ Sautéed for 2s` line IS captured. Parser must complete the turn
    // from that signal alone, given activity was observed.
    const p = new TuiParser();
    p.markTurnStarted();
    // Snapshot 1: assistant text is visible (activity=true) and a spinner is
    // still rendering; no footer / no past-tense summary yet.
    p.parse(snapFromLines(['⏺ Blank.', '✳ Spinning…']));
    // Snapshot 2: past-tense summary now visible, still no footer.
    const evs = p.parse(snapFromLines(['⏺ Blank.', '✻ Sautéed for 2s']));
    expect(evs.find((e) => e.type === 'turn_complete')).toBeDefined();
  });

  it('latches turn_complete via lastFooter when ready was seen during activity but the snapshot then loses footer match', () => {
    // The bug we observed live: ready footer is visible briefly during
    // mid-turn rendering but lost on the next snapshot. Provided we
    // observed busy at some point AND we have activity, turn_complete
    // must still fire. This test forces the sequence by sending activity
    // and ready in the same snapshot, then unknown-footer in the next —
    // the first snapshot will fire turn_complete; the latch ensures the
    // engine clears `inTurn`.
    const p = new TuiParser();
    p.markTurnStarted();
    p.parse(snapFromLines(['esc to interrupt'])); // sawBusy
    const evs1 = p.parse(snapFromLines(['⏺ Hi', '? for shortcuts']));
    expect(evs1.find((e) => e.type === 'turn_complete')).toBeDefined();
    // Subsequent unknown-footer snapshot must NOT fire turn_complete again.
    const evs2 = p.parse(snapFromLines(['⏺ Hi']));
    expect(evs2.find((e) => e.type === 'turn_complete')).toBeUndefined();
  });
});

describe('TuiParser trust_prompt', () => {
  it('emits trust_prompt when the workspace-trust dialog appears', () => {
    const p = new TuiParser();
    const evs = p.parse(
      snapFromLines([
        'Accessing workspace:',
        '/private/tmp',
        'Quick safety check: Is this a project you created or one you trust?',
        '❯ 1. Yes, I trust this folder',
        '  2. No, exit',
      ]),
    );
    expect(evs.find((e) => e.type === 'trust_prompt')).toBeDefined();
  });

  it('suppresses ready while the trust dialog is visible', () => {
    const p = new TuiParser();
    const evs = p.parse(
      snapFromLines(['Quick safety check', '❯ 1. Yes, I trust this folder', '? for shortcuts']),
    );
    expect(evs.find((e) => e.type === 'ready')).toBeUndefined();
    expect(evs.find((e) => e.type === 'trust_prompt')).toBeDefined();
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
    expect(DEFAULT_PATTERNS.readyMarker.test('? for shortcuts ● high · /effort')).toBe(true);
    expect(DEFAULT_PATTERNS.readyMarker.test('⏵⏵ bypass permissions on (shift+tab to cycle)')).toBe(true);
    expect(DEFAULT_PATTERNS.busyFooter.test('esc to interrupt ● high')).toBe(true);
    expect(DEFAULT_PATTERNS.assistantBlockStart.test('⏺ hi')).toBe(true);
    expect(DEFAULT_PATTERNS.assistantBlockStart.test('● hi')).toBe(true);
    expect(DEFAULT_PATTERNS.reasoningBlockStart.test('✻ Thinking…')).toBe(true);
    expect(DEFAULT_PATTERNS.reasoningBlockStart.test('✻ Cogitating...')).toBe(true);
    // past-tense turn summaries are NOT reasoning
    expect(DEFAULT_PATTERNS.reasoningBlockStart.test('✻ Cogitated for 0s')).toBe(false);
    expect(DEFAULT_PATTERNS.reasoningBlockStart.test('✻ Brewed for 2s')).toBe(false);
    expect(DEFAULT_PATTERNS.toolCallLine.test('⏺ Bash(ls)')).toBe(true);
    expect(DEFAULT_PATTERNS.toolCallLine.test('● Bash(ls)')).toBe(true);
    expect(DEFAULT_PATTERNS.toolCallLine.test('● fibe - fibe_resource_list (MCP)(resource: "playground")')).toBe(true);
    expect(DEFAULT_PATTERNS.toolCallLine.test('● fibe - fibe_resource_list (MCP)')).toBe(true);
    expect(DEFAULT_PATTERNS.usageLine.test('Usage: 10 in / 20 out')).toBe(true);
    expect(DEFAULT_PATTERNS.trustPrompt.test('Quick safety check')).toBe(true);
    expect(DEFAULT_PATTERNS.trustPrompt.test('❯ 1. Yes, I trust this folder')).toBe(true);
  });
});
