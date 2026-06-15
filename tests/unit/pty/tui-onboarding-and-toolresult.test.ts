import { describe, expect, it } from 'vitest';
import { TuiParser, type TuiEvent } from '../../../src/pty/tui-parser.js';
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

// Regression: a Bash turn's raw stdout under `⎿` must NOT be misread as a
// tool_result whose "name" is a fragment of command output. Observed live
// on claude 2.1.156: `Bash(echo june1815-works)` produced a correct
// tool_use {Bash} PLUS a phantom tool_result {name:"june1815-works"} which
// the SSE layer surfaces as a bogus tool_use.
describe('TUI tool-result: command output is not a phantom tool_result', () => {
  it('emits the real Bash tool_use but NOT a tool_result for its stdout', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(
      snapFromLines(['⏺ Bash(echo june1815-works)', '  ⎿ june1815-works and more text']),
    );
    const toolUse = evs.find(
      (e): e is Extract<TuiEvent, { type: 'tool_use' }> => e.type === 'tool_use',
    );
    expect(toolUse).toEqual({ type: 'tool_use', name: 'Bash', summary: 'echo june1815-works' });
    // The stdout line's first token ("june1815-works") is not a tool name.
    expect(evs.find((e) => e.type === 'tool_result')).toBeUndefined();
  });

  it('still emits tool_result for a real CamelCase tool-name header line', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(snapFromLines(['⎿ Read /etc/hosts (68 bytes)']));
    const tr = evs.find(
      (e): e is Extract<TuiEvent, { type: 'tool_result' }> => e.type === 'tool_result',
    );
    expect(tr).toEqual({ type: 'tool_result', name: 'Read', summary: '/etc/hosts (68 bytes)' });
  });

  it('still emits tool_result for an MCP `server__tool` header line', () => {
    const p = new TuiParser();
    p.markTurnStarted();
    const evs = p.parse(snapFromLines(['⎿ acme__find_user matched 3 users']));
    const tr = evs.find(
      (e): e is Extract<TuiEvent, { type: 'tool_result' }> => e.type === 'tool_result',
    );
    expect(tr?.name).toBe('acme__find_user');
  });
});

// Regression: a first-run onboarding screen (theme / effort picker) has no
// ready/busy footer, so the conversation hung in `starting`. The parser now
// emits internal drive events; Conversation accepts the highlighted default.
describe('TUI onboarding: emits drive events instead of a public error', () => {
  const event = <T extends TuiEvent['type']>(evs: readonly TuiEvent[], type: T) =>
    evs.find((e): e is Extract<TuiEvent, { type: T }> => e.type === type);

  it('emits onboarding_theme on the theme picker', () => {
    const p = new TuiParser();
    const evs = p.parse(
      snapFromLines([
        'Welcome to Claude Code v2.1.50',
        "Let's get started.",
        'Choose the text style that looks best with your terminal',
        '❯ 1. Dark mode',
        '  2. Light mode',
      ]),
    );
    expect(event(evs, 'onboarding_theme')).toBeDefined();
    expect(evs.find((e) => e.type === 'error')).toBeUndefined();
    // No ready footer is present on the picker, so `ready` must not fire.
    expect(evs.find((e) => e.type === 'ready')).toBeUndefined();
  });

  it('emits onboarding_effort on the Opus effort picker', () => {
    const p = new TuiParser();
    const evs = p.parse(
      snapFromLines([
        'Effort in Opus 4.6',
        'Effort lets you control the tradeoff between thoroughness and token efficiency.',
        '❯ 1. Use high effort (current)',
        '  2. Use medium effort',
      ]),
    );
    expect(event(evs, 'onboarding_effort')).toBeDefined();
    expect(evs.find((e) => e.type === 'error')).toBeUndefined();
  });

  it('emits onboarding_splash on the generic start screen', () => {
    const p = new TuiParser();
    const evs = p.parse(snapFromLines(["Let's get started."]));
    expect(event(evs, 'onboarding_splash')).toBeDefined();
    expect(evs.find((e) => e.type === 'error')).toBeUndefined();
  });

  it('does NOT fire on the normal home screen (and ready still works)', () => {
    const p = new TuiParser();
    const evs = p.parse(
      snapFromLines(['Welcome back Vale!', 'Tips for getting started', '? for shortcuts']),
    );
    expect(event(evs, 'onboarding_splash')).toBeUndefined();
    expect(event(evs, 'onboarding_theme')).toBeUndefined();
    expect(event(evs, 'onboarding_effort')).toBeUndefined();
    expect(evs.find((e) => e.type === 'ready')).toBeDefined();
  });

  it('re-emits while the screen is still visible so the driver can retry', () => {
    const p = new TuiParser();
    const lines = ['Choose the text style that looks best with your terminal', '❯ 1. Dark mode'];
    expect(event(p.parse(snapFromLines(lines)), 'onboarding_theme')).toBeDefined();
    expect(event(p.parse(snapFromLines(lines)), 'onboarding_theme')).toBeDefined();
  });
});
