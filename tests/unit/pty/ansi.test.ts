import { describe, expect, it } from 'vitest';
import {
  extractBlock,
  findLastLineIndex,
  findLineIndex,
  stripAnsi,
  stripAnsiLines,
  trimTrailingEmpty,
} from '../../../src/pty/ansi.js';

describe('stripAnsi', () => {
  it('removes SGR (color) sequences', () => {
    expect(stripAnsi('\x1b[31merror\x1b[0m')).toBe('error');
  });

  it('removes cursor positioning sequences', () => {
    expect(stripAnsi('\x1b[2;1Hhi')).toBe('hi');
  });

  it('removes OSC sequences', () => {
    expect(stripAnsi('\x1b]0;window title\x07after')).toBe('after');
  });

  it('passes through plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('stripAnsiLines maps over arrays', () => {
    expect(stripAnsiLines(['\x1b[31mred\x1b[0m', 'plain'])).toEqual(['red', 'plain']);
  });
});

describe('findLineIndex', () => {
  const lines = ['alpha', 'beta', 'gamma', 'beta'];

  it('finds the first match', () => {
    expect(findLineIndex(lines, (l) => l === 'beta')).toBe(1);
  });

  it('honors the `from` offset', () => {
    expect(findLineIndex(lines, (l) => l === 'beta', 2)).toBe(3);
  });

  it('returns -1 when no match', () => {
    expect(findLineIndex(lines, (l) => l === 'omega')).toBe(-1);
  });

  it('clamps negative `from` to zero', () => {
    expect(findLineIndex(lines, (l) => l === 'alpha', -5)).toBe(0);
  });
});

describe('findLastLineIndex', () => {
  const lines = ['alpha', 'beta', 'gamma', 'beta'];

  it('finds the last match', () => {
    expect(findLastLineIndex(lines, (l) => l === 'beta')).toBe(3);
  });

  it('honors the `to` bound', () => {
    expect(findLastLineIndex(lines, (l) => l === 'beta', 2)).toBe(1);
  });

  it('returns -1 with no match', () => {
    expect(findLastLineIndex(lines, () => false)).toBe(-1);
  });
});

describe('extractBlock', () => {
  it('extracts the lines between two markers (exclusive of both)', () => {
    const lines = ['header', 'BEGIN', 'a', 'b', 'END', 'footer'];
    const block = extractBlock(
      lines,
      (l) => l === 'BEGIN',
      (l) => l === 'END',
    );
    expect(block).not.toBeNull();
    expect(block?.inner).toEqual(['a', 'b']);
    expect(block?.startIdx).toBe(1);
    expect(block?.endIdx).toBe(4);
  });

  it('returns null when start marker missing', () => {
    expect(
      extractBlock(['a', 'b'], (l) => l === 'X', () => true),
    ).toBeNull();
  });

  it('returns null when end marker missing', () => {
    expect(
      extractBlock(['BEGIN', 'a', 'b'], (l) => l === 'BEGIN', (l) => l === 'END'),
    ).toBeNull();
  });

  it('skips end markers before start', () => {
    const lines = ['END', 'BEGIN', 'x', 'END'];
    const block = extractBlock(
      lines,
      (l) => l === 'BEGIN',
      (l) => l === 'END',
    );
    expect(block?.inner).toEqual(['x']);
  });
});

describe('trimTrailingEmpty', () => {
  it('removes trailing empty and whitespace-only lines', () => {
    expect(trimTrailingEmpty(['a', 'b', '', '   ', ''])).toEqual(['a', 'b']);
  });

  it('keeps interior empties', () => {
    expect(trimTrailingEmpty(['a', '', 'b'])).toEqual(['a', '', 'b']);
  });

  it('returns [] for all-empty input', () => {
    expect(trimTrailingEmpty(['', '  ', ''])).toEqual([]);
  });

  it('returns the input unchanged when nothing trails', () => {
    expect(trimTrailingEmpty(['a', 'b'])).toEqual(['a', 'b']);
  });
});
