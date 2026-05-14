/**
 * Text transformations applied to extracted blocks before they become
 * event payloads. Each transform is a pure `string -> string` (or
 * `string[] -> string[]`) function. The pipeline composes them in a
 * fixed order; new transforms slot in by name.
 *
 * Keeping these in one file means "the TUI emitted a weird artifact"
 * fixes are a one-line addition here, not a hunt across regex sites.
 */

export type LineTransform = (lines: readonly string[]) => string[];
export type TextTransform = (text: string) => string;

/** Remove trailing tabs/spaces from each line. xterm pads cells with
 *  spaces up to the column width; without this every payload looks
 *  ragged. */
export const trimRightPerLine: LineTransform = (lines) =>
  lines.map((l) => l.replace(/[ \t]+$/u, ''));

/** Drop empty lines at the head and tail of the block. Interior blanks
 *  are preserved so paragraph breaks survive. */
export const trimEdgeBlanks: LineTransform = (lines) => {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] ?? '').trim().length === 0) start += 1;
  while (end > start && (lines[end - 1] ?? '').trim().length === 0) end -= 1;
  return lines.slice(start, end);
};

/** Collapse runs of 3+ blank lines into a single blank line. */
export const collapseBlankRuns: LineTransform = (lines) => {
  const out: string[] = [];
  let blanksInRow = 0;
  for (const line of lines) {
    const isBlank = line.trim().length === 0;
    if (isBlank) {
      blanksInRow += 1;
      if (blanksInRow <= 1) out.push('');
    } else {
      blanksInRow = 0;
      out.push(line);
    }
  }
  return out;
};

/** Strip the marker glyph + one space at the start of a line. Used by
 *  the assistant/reasoning extractors to peel the `⏺ ` prefix off the
 *  first line. */
export function stripLeadingMarker(line: string, marker: string): string {
  const re = new RegExp(`^\\s*${marker}\\s*`, 'u');
  return line.replace(re, '');
}

/** Run a pipeline of line-transforms in order. Each transform sees the
 *  output of the previous one. */
export function pipeLines(
  lines: readonly string[],
  ...stages: readonly LineTransform[]
): string[] {
  let current: readonly string[] = lines;
  for (const stage of stages) current = stage(current);
  return current as string[];
}

/** Return the suffix of `current` that wasn't present in `prev`. Falls
 *  back to the full string when `current` doesn't extend `prev` (block
 *  was re-rendered from scratch). Caller decides whether to emit. */
export function computeDelta(prev: string, current: string): string {
  if (current === prev) return '';
  if (current.startsWith(prev)) return current.slice(prev.length);
  return current;
}

/** Subtract `prefix` from the start of `text` if `text` startsWith it.
 *  Used to scrub the previous-turn response when claude renders both
 *  turns concatenated on one buffer line. */
export function stripKnownPrefix(text: string, prefix: string): string {
  if (prefix.length === 0) return text;
  if (text.startsWith(prefix)) return text.slice(prefix.length).replace(/^\s+/u, '');
  return text;
}
