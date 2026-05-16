import { describe, expect, it } from 'vitest';
import { BUILT_IN_TOOL_DEFS } from '../../../src/tools/built-in-tool-defs.js';
import { ToolInputSynthesizer, __test } from '../../../src/tools/synthesizer.js';
import type { ToolDefs } from '../../../src/tools/tool-defs.js';

const onlyBuiltIns = ToolInputSynthesizer.fromDefs([BUILT_IN_TOOL_DEFS]);

describe('ToolInputSynthesizer with built-in defs', () => {
  it('Read → { file_path } (and strips the trailing "(N bytes)" annotation)', () => {
    expect(onlyBuiltIns.synthesize('Read', '/etc/hosts')).toEqual({ file_path: '/etc/hosts' });
    expect(onlyBuiltIns.synthesize('Read', '/etc/hosts (1234 bytes)'))
      .toEqual({ file_path: '/etc/hosts' });
    expect(onlyBuiltIns.synthesize('Read', '/a/b/c.txt (42 lines)'))
      .toEqual({ file_path: '/a/b/c.txt' });
  });

  it('Bash → { command }', () => {
    expect(onlyBuiltIns.synthesize('Bash', 'ls -la')).toEqual({ command: 'ls -la' });
  });

  it('Edit → { file_path }', () => {
    expect(onlyBuiltIns.synthesize('Edit', '/srv/app.ts')).toEqual({ file_path: '/srv/app.ts' });
  });

  it('Grep / Glob → { pattern }', () => {
    expect(onlyBuiltIns.synthesize('Grep', 'TODO:')).toEqual({ pattern: 'TODO:' });
    expect(onlyBuiltIns.synthesize('Glob', '**/*.ts')).toEqual({ pattern: '**/*.ts' });
  });

  it('unknown tool falls back to { summary }', () => {
    expect(onlyBuiltIns.synthesize('NotARealTool', 'foo bar')).toEqual({ summary: 'foo bar' });
  });
});

describe('ToolInputSynthesizer with user defs', () => {
  it('regex with numbered captures populates {1} and {2}', () => {
    const userDefs: ToolDefs = {
      version: 1,
      tools: {
        SplitTool: {
          summaryRegex: '^(\\S+)\\s+(.+)$',
          input: { first: '{1}', rest: '{2}' },
        },
      },
    };
    const s = ToolInputSynthesizer.fromDefs([userDefs]);
    expect(s.synthesize('SplitTool', 'alice corp inc')).toEqual({ first: 'alice', rest: 'corp inc' });
  });

  it('regex with named captures populates {name}', () => {
    const userDefs: ToolDefs = {
      version: 1,
      tools: {
        Lookup: {
          summaryRegex: '^(?<who>\\S+)\\s+in\\s+(?<scope>\\S+)$',
          input: { user: '{who}', org: '{scope}' },
        },
      },
    };
    const s = ToolInputSynthesizer.fromDefs([userDefs]);
    expect(s.synthesize('Lookup', 'alice in acme')).toEqual({ user: 'alice', org: 'acme' });
  });

  it('user def overrides a built-in', () => {
    const userDefs: ToolDefs = {
      version: 1,
      tools: {
        Read: { input: { custom_file: '{summary}', kind: 'file' } },
      },
    };
    const s = ToolInputSynthesizer.fromDefs([BUILT_IN_TOOL_DEFS, userDefs]);
    expect(s.synthesize('Read', '/etc/hosts')).toEqual({ custom_file: '/etc/hosts', kind: 'file' });
  });

  it('falls back to { summary } when summaryRegex does not match', () => {
    const userDefs: ToolDefs = {
      version: 1,
      tools: {
        Strict: {
          summaryRegex: '^EXACT-ONLY$',
          input: { matched: 'never' },
        },
      },
    };
    const s = ToolInputSynthesizer.fromDefs([userDefs]);
    expect(s.synthesize('Strict', 'anything else')).toEqual({ summary: 'anything else' });
  });

  it('passes non-string values verbatim (numbers, booleans, arrays, nested objects)', () => {
    const userDefs: ToolDefs = {
      version: 1,
      tools: {
        Complex: {
          input: {
            label: '{summary}',
            limit: 10,
            enabled: true,
            tags: ['x', '{summary}'],
            nested: { deep: '{summary}', count: 3 },
          },
        },
      },
    };
    const s = ToolInputSynthesizer.fromDefs([userDefs]);
    expect(s.synthesize('Complex', 'hello')).toEqual({
      label: 'hello',
      limit: 10,
      enabled: true,
      tags: ['x', 'hello'],
      nested: { deep: 'hello', count: 3 },
    });
  });

  it('leaves unknown tokens as literal text (no silent corruption)', () => {
    expect(__test.interpolateString('plain {x} {summary}', {
      summary: 'S',
      numbered: [],
      named: {},
    })).toBe('plain {x} S');
  });
});
