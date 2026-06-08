import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadToolDefs, __test } from '../../../src/tools/loader.js';

function tempDir(): string {
  const dir = join(tmpdir(), `june1815-loader-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

interface Warner {
  readonly messages: string[];
  readonly io: { warn: (msg: string) => void };
}
function warner(): Warner {
  const messages: string[] = [];
  return { messages, io: { warn: (m) => { messages.push(m); } } };
}

let dir: string;
beforeEach(() => { dir = tempDir(); });
afterEach(() => {/* tmp dirs are best-effort cleanup; OS handles it. */});

describe('loadToolDefs discovery + merge', () => {
  it('built-ins always come first', () => {
    const docs = loadToolDefs({});
    expect(docs.length).toBeGreaterThanOrEqual(1);
    // Bash is a stable single-summary mapping — Read's regex may evolve.
    expect(docs[0]?.tools.Bash).toEqual({ input: { command: '{summary}' } });
  });

  it('env paths add to the list in order', () => {
    const a = join(dir, 'a.json');
    writeFileSync(a, JSON.stringify({ version: 1, tools: { A: { input: { from: 'a' } } } }));
    const b = join(dir, 'b.json');
    writeFileSync(b, JSON.stringify({ version: 1, tools: { B: { input: { from: 'b' } } } }));

    const docs = loadToolDefs({ envPaths: [a, b] });
    expect(docs).toHaveLength(3); // built-ins + 2
    expect(docs[1]?.tools.A?.input).toEqual({ from: 'a' });
    expect(docs[2]?.tools.B?.input).toEqual({ from: 'b' });
  });

  it('CLI paths come after env paths and configDir', () => {
    const env = join(dir, 'env.json');
    writeFileSync(env, JSON.stringify({ version: 1, tools: { T: { input: { from: 'env' } } } }));
    const cfgDir = join(dir, 'cfg');
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(join(cfgDir, 'tool-defs.json'), JSON.stringify({ version: 1, tools: { T: { input: { from: 'cfg' } } } }));
    const cli = join(dir, 'cli.json');
    writeFileSync(cli, JSON.stringify({ version: 1, tools: { T: { input: { from: 'cli' } } } }));

    const docs = loadToolDefs({ envPaths: [env], configDir: cfgDir, cliPaths: [cli] });
    expect(docs.map((d) => d.tools.T?.input)).toEqual([
      undefined, // built-ins don't define T
      { from: 'env' },
      { from: 'cfg' },
      { from: 'cli' },
    ]);
  });

  it('silently skips missing paths', () => {
    const w = warner();
    const docs = loadToolDefs({ envPaths: [join(dir, 'does-not-exist.json')], io: w.io });
    expect(docs).toHaveLength(1); // only built-ins
    expect(w.messages).toEqual([]);
  });

  it('warns and skips malformed JSON', () => {
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{this is not json}');
    const w = warner();
    const docs = loadToolDefs({ envPaths: [bad], io: w.io });
    expect(docs).toHaveLength(1);
    expect(w.messages.join('\n')).toMatch(/not valid JSON/);
  });

  it('warns and skips wrong version', () => {
    const bad = join(dir, 'wrong-version.json');
    writeFileSync(bad, JSON.stringify({ version: 2, tools: {} }));
    const w = warner();
    const docs = loadToolDefs({ envPaths: [bad], io: w.io });
    expect(docs).toHaveLength(1);
    expect(w.messages.join('\n')).toMatch(/validation failed/);
  });

  it('warns and skips invalid summaryRegex', () => {
    const bad = join(dir, 'badre.json');
    writeFileSync(
      bad,
      JSON.stringify({ version: 1, tools: { T: { summaryRegex: '(unclosed', input: { x: '{1}' } } } }),
    );
    const w = warner();
    const docs = loadToolDefs({ envPaths: [bad], io: w.io });
    expect(docs).toHaveLength(1);
    expect(w.messages.join('\n')).toMatch(/invalid summaryRegex/);
  });

  it('warns and skips when a template references a group past the regex group count', () => {
    const bad = join(dir, 'oob.json');
    writeFileSync(
      bad,
      JSON.stringify({
        version: 1,
        tools: { T: { summaryRegex: '^(\\S+)$', input: { a: '{1}', b: '{2}' } } },
      }),
    );
    const w = warner();
    const docs = loadToolDefs({ envPaths: [bad], io: w.io });
    expect(docs).toHaveLength(1);
    expect(w.messages.join('\n')).toMatch(/references capture group \{2\}/);
  });

  it('warns and skips when a template references an undefined named group', () => {
    const bad = join(dir, 'named-oob.json');
    writeFileSync(
      bad,
      JSON.stringify({
        version: 1,
        tools: { T: { summaryRegex: '^(?<a>\\S+)$', input: { x: '{a}', y: '{b}' } } },
      }),
    );
    const w = warner();
    const docs = loadToolDefs({ envPaths: [bad], io: w.io });
    expect(docs).toHaveLength(1);
    expect(w.messages.join('\n')).toMatch(/named group \{b\}/);
  });
});

describe('regex group counting (internal)', () => {
  it('counts numbered capturing groups', () => {
    expect(__test.countCapturingGroups('(a)(b)(c)')).toBe(3);
  });

  it('ignores non-capturing groups (?:…)', () => {
    expect(__test.countCapturingGroups('(?:a)(b)')).toBe(1);
  });

  it('ignores lookahead and lookbehind', () => {
    expect(__test.countCapturingGroups('(?=a)(?!b)(?<=c)(?<!d)(e)')).toBe(1);
  });

  it('counts named groups as capturing', () => {
    expect(__test.countCapturingGroups('(?<name>x)(?<other>y)')).toBe(2);
  });

  it('extracts named group names', () => {
    expect([...__test.extractNamedGroups('(?<a>x)(?<bee>y)(unnamed)')]).toEqual(['a', 'bee']);
  });

  it('skips groups inside character classes', () => {
    expect(__test.countCapturingGroups('[(](a)[)]')).toBe(1);
  });
});
