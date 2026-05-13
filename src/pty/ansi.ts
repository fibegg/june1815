// OSC sequences: ESC ] ... ST  (ST = BEL, ESC \, or 0x9c). Allow any
// non-terminator characters in the body, including spaces (real terminals
// embed spaces in window titles). Matched first so the more restrictive
// CSI regex doesn't eat the leading ESC.
// eslint-disable-next-line no-control-regex
const OSC_RE = /\x1b\][\s\S]*?(?:\x07|\x1b\\|\x9c)/g;

// CSI / DCS / single-char escapes — adapted from sindresorhus/ansi-regex (MIT).
const ANSI_PATTERN = [
  '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[\\-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[\\-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?(?:\\u0007|\\u001B\\u005C|\\u009C))',
  '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))',
].join('|');
const ANSI_RE = new RegExp(ANSI_PATTERN, 'g');

/** Remove every ANSI escape sequence from a string. */
export function stripAnsi(s: string): string {
  return s.replace(OSC_RE, '').replace(ANSI_RE, '');
}

/** Strip ANSI from each line in an array (non-mutating). */
export function stripAnsiLines(lines: readonly string[]): string[] {
  return lines.map(stripAnsi);
}

/**
 * Find the first index in `lines` where `predicate` returns true, starting
 * at `from`. Returns -1 if no match.
 */
export function findLineIndex(
  lines: readonly string[],
  predicate: (line: string, idx: number) => boolean,
  from = 0,
): number {
  for (let i = Math.max(0, from); i < lines.length; i += 1) {
    if (predicate(lines[i] ?? '', i)) return i;
  }
  return -1;
}

/**
 * Find the last index in `lines` where `predicate` returns true, searching
 * backward from `to` (default end of array). Returns -1 if no match.
 */
export function findLastLineIndex(
  lines: readonly string[],
  predicate: (line: string, idx: number) => boolean,
  to: number = lines.length - 1,
): number {
  for (let i = Math.min(lines.length - 1, to); i >= 0; i -= 1) {
    if (predicate(lines[i] ?? '', i)) return i;
  }
  return -1;
}

/**
 * Slice out a contiguous block of lines bounded by a start-marker and an
 * end-marker. Returns the start index, end index (exclusive), and the lines
 * between them (NOT including the boundary lines). Returns null if either
 * boundary is missing.
 */
export function extractBlock(
  lines: readonly string[],
  startPredicate: (line: string, idx: number) => boolean,
  endPredicate: (line: string, idx: number) => boolean,
  startFrom = 0,
): { readonly startIdx: number; readonly endIdx: number; readonly inner: readonly string[] } | null {
  const startIdx = findLineIndex(lines, startPredicate, startFrom);
  if (startIdx === -1) return null;
  const endIdx = findLineIndex(lines, endPredicate, startIdx + 1);
  if (endIdx === -1) return null;
  return {
    startIdx,
    endIdx,
    inner: lines.slice(startIdx + 1, endIdx),
  };
}

/**
 * Trim trailing empty lines from the end of an array. Useful for normalizing
 * a region's content before emitting it as a delta — xterm-headless pads
 * the cell buffer to its full geometry, so a region with one real line will
 * still snapshot as ['real text', '', '', '', ...].
 */
export function trimTrailingEmpty(lines: readonly string[]): string[] {
  let end = lines.length;
  while (end > 0 && (lines[end - 1] ?? '').trim().length === 0) end -= 1;
  return lines.slice(0, end);
}
