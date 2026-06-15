import { describe, expect, it } from 'vitest';
import { splitArgs } from '../../../../src/cli/shim/arg-filter.js';

describe('splitArgs', () => {
  it('strips the stream-json IPC bool flags', () => {
    const r = splitArgs(['-p', '--print', '--include-partial-messages', '--replay-user-messages']);
    expect(r.passthrough).toEqual([]);
    expect(r.stripped).toEqual([
      '-p',
      '--print',
      '--include-partial-messages',
      '--replay-user-messages',
    ]);
  });

  it('strips value-taking IPC flags along with their values', () => {
    const r = splitArgs([
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--permission-prompt-tool', 'stdio',
    ]);
    expect(r.passthrough).toEqual([]);
    expect(r.stripped).toEqual([
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--permission-prompt-tool', 'stdio',
    ]);
  });

  it('extracts session-relevant flags AND forwards them to passthrough', () => {
    const r = splitArgs([
      '--model', 'claude-opus-4-7',
      '--effort', 'max',
      '--resume', 'sess_123',
      '--permission-mode', 'plan',
    ]);
    expect(r.extracted.model).toBe('claude-opus-4-7');
    expect(r.extracted.effort).toBe('max');
    expect(r.extracted.resume).toBe('sess_123');
    expect(r.extracted.permissionMode).toBe('plan');
    expect(r.passthrough).toEqual([
      '--model', 'claude-opus-4-7',
      '--effort', 'max',
      '--resume', 'sess_123',
      '--permission-mode', 'plan',
    ]);
    expect(r.stripped).toEqual([]);
  });

  it('extracts --tool-defs (repeatable) but does NOT forward it (shim-only)', () => {
    const r = splitArgs([
      '--tool-defs', '/etc/one.json',
      '--tool-defs', '/etc/two.json',
      '--model', 'x',
    ]);
    expect(r.extracted.toolDefs).toEqual(['/etc/one.json', '/etc/two.json']);
    expect(r.passthrough).toEqual(['--model', 'x']);
  });

  it('extracts --cwd as shim-only, not forwarded', () => {
    const r = splitArgs(['--cwd', '/tmp/work', '--model', 'x']);
    expect(r.extracted.cwd).toBe('/tmp/work');
    expect(r.passthrough).toEqual(['--model', 'x']);
  });

  it('preserves order of passthrough args', () => {
    const r = splitArgs([
      '--model', 'opus',
      '--add-dir', '/a',
      '--effort', 'high',
      '--add-dir', '/b',
    ]);
    expect(r.passthrough).toEqual([
      '--model', 'opus',
      '--add-dir', '/a',
      '--effort', 'high',
      '--add-dir', '/b',
    ]);
    expect(r.extracted.addDirs).toEqual(['/a', '/b']);
  });

  it('forwards unknown flags verbatim (future-proofing)', () => {
    const r = splitArgs(['--brand-new-flag', 'value', '--another']);
    expect(r.passthrough).toEqual(['--brand-new-flag', 'value', '--another']);
    expect(r.stripped).toEqual([]);
  });

  it('handles --flag=value form', () => {
    const r = splitArgs(['--model=opus', '--output-format=stream-json']);
    expect(r.extracted.model).toBe('opus');
    expect(r.passthrough).toEqual(['--model', 'opus']);
    expect(r.stripped).toEqual(['--output-format', 'stream-json']);
  });

  it('forwards --allow-dangerously-skip-permissions verbatim', () => {
    const r = splitArgs(['--allow-dangerously-skip-permissions']);
    expect(r.passthrough).toEqual(['--allow-dangerously-skip-permissions']);
  });

  it('forwards real TUI flags such as --verbose', () => {
    const r = splitArgs(['--verbose']);
    expect(r.passthrough).toEqual(['--verbose']);
    expect(r.stripped).toEqual([]);
  });

  it('full SDK-style invocation: keeps useful args, drops IPC noise', () => {
    const r = splitArgs([
      '--output-format', 'stream-json',
      '--verbose',
      '--input-format', 'stream-json',
      '--effort', 'max',
      '--model', 'claude-opus-4-7',
      '--permission-prompt-tool', 'stdio',
      '--allowedTools', 'mcp__local',
      '--allowed-tools', 'Bash(git:*)',
      '--setting-sources', 'user,project,local',
      '--permission-mode', 'plan',
      '--allow-dangerously-skip-permissions',
      '--include-partial-messages',
      '--plugin-dir', '/some/dir',
      '--replay-user-messages',
      '--settings', '{}',
    ]);
    expect(r.passthrough).toEqual([
      '--verbose',
      '--effort', 'max',
      '--model', 'claude-opus-4-7',
      '--allowedTools', 'mcp__local',
      '--allowed-tools', 'Bash(git:*)',
      '--setting-sources', 'user,project,local',
      '--permission-mode', 'plan',
      '--allow-dangerously-skip-permissions',
      '--plugin-dir', '/some/dir',
      '--settings', '{}',
    ]);
    expect(r.stripped).toEqual([
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--permission-prompt-tool', 'stdio',
      '--include-partial-messages',
      '--replay-user-messages',
    ]);
  });
});
