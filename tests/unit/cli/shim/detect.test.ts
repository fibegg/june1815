import { describe, expect, it } from 'vitest';
import { isShimInvocation } from '../../../../src/cli/shim/detect.js';

describe('isShimInvocation', () => {
  it('returns true on --output-format stream-json (space form)', () => {
    expect(isShimInvocation(['--output-format', 'stream-json'])).toBe(true);
  });

  it('returns true on --output-format=stream-json (equals form)', () => {
    expect(isShimInvocation(['--output-format=stream-json'])).toBe(true);
  });

  it('returns true on --input-format stream-json', () => {
    expect(isShimInvocation(['--input-format', 'stream-json'])).toBe(true);
  });

  it('returns true on -p alone (legacy print)', () => {
    expect(isShimInvocation(['-p'])).toBe(true);
  });

  it('returns true on --print alone', () => {
    expect(isShimInvocation(['--print'])).toBe(true);
  });

  it('returns false for an interactive (gogogo) invocation', () => {
    expect(isShimInvocation(['gogogo', '--port', '7000'])).toBe(false);
  });

  it('returns false for an unrelated --output-format value', () => {
    expect(isShimInvocation(['--output-format', 'json'])).toBe(false);
  });

  it('returns false on an empty argv', () => {
    expect(isShimInvocation([])).toBe(false);
  });

  it('recognises the SDK\'s full invocation', () => {
    expect(
      isShimInvocation([
        '--output-format', 'stream-json',
        '--verbose',
        '--input-format', 'stream-json',
        '--model', 'claude-opus-4-7',
      ]),
    ).toBe(true);
  });
});
